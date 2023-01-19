import { HandlerOpts, WorkflowExecution } from "../backends/backend.ts";
import { Event, Queue } from "https://deno.land/x/async@v1.2.0/mod.ts";
import { WorkflowContext } from "../context.ts";
import { HistoryEvent, apply, newEvent } from "../events.ts";
import { WorkflowState, zeroState } from "../state.ts";
import { Arg } from "../types.ts";
import { Workflow, WorkflowGen, WorkflowGenFn } from "../workflow.ts";
import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";
import { DB } from "../backends/backend.ts";
import { delay } from "https://deno.land/std@0.160.0/async/delay.ts";
import { startWorkers, WorkItem } from "../worker/starter.ts";
import { tryParseInt } from "../utils.ts";

/**
 * WorkflowCreationOptions is used for creating workflows of a given executionId.
 */
export interface WorkflowCreationOptions {
  executionId?: string;
  alias: string;
}

const MAX_LOCK_MINUTES =
  tryParseInt(Deno.env.get("WORKERS_LOCK_MINUTES")) ?? 10;

const DELAY_WHEN_NO_PENDING_EVENTS_MS =
  tryParseInt(Deno.env.get("PG_INTERVAL_EMPTY_EVENTS")) ?? 5_000;

async function* executionsGenerator(
  db: DB,
  freeWorkers: () => number,
  cancellation: Event
): AsyncGenerator<WorkItem<string>, void, unknown> {
  while (!cancellation.is_set()) {
    const limit = freeWorkers();
    if (limit === 0) {
      await Promise.race([
        delay(DELAY_WHEN_NO_PENDING_EVENTS_MS),
        cancellation.wait(),
      ]);
      continue;
    }
    const executionIds = await Promise.race([
      db.pendingExecutions(MAX_LOCK_MINUTES, limit),
      cancellation.wait(),
    ]);

    if (executionIds == true) {
      break;
    }

    if (executionIds.length == 0) {
      await Promise.race([
        delay(DELAY_WHEN_NO_PENDING_EVENTS_MS),
        cancellation.wait(),
      ]);
      continue;
    }

    for (const { execution: item, unlock } of executionIds) {
      yield {
        item,
        onError: unlock,
        onSuccess: unlock,
      };
    }
  }
}

export class WorkflowService {
  protected registry: Map<string, Workflow>;
  constructor(protected backend: DB) {
    this.registry = new Map();
  }

  /**
   * start the background workers.
   */
  public async startWorkers(opts?: HandlerOpts) {
    const workerCount = opts?.concurrency ?? 1;
    const q = new Queue<WorkItem<string>>(workerCount);
    await startWorkers(
      (async (executionId: string) => {
        await this.runWorkflow(executionId);
      }).bind(this),
      executionsGenerator(
        this.backend,
        () => workerCount - q.qsize(),
        opts?.cancellation ?? new Event()
      ),
      workerCount,
      q
    );
  }

  /**
   * register the given workflow function in the registry map.
   * let the workflow function to be available to execute.
   * by default uses the function name as the workflow alias
   * @param wkf the workflow function
   * @param alias optional alias
   */
  public registerWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    wkf: Workflow<TArgs, TResult>,
    alias?: string
  ): void {
    this.registry.set(alias ?? wkf.name, wkf as Workflow);
  }

  /**
   * Signal the workflow with the given signal and payload.
   */
  public async signalWorkflow(
    executionId: string,
    signal: string,
    payload?: unknown
  ): Promise<void> {
    await this.backend.execution(executionId).pending.add({
      ...newEvent(),
      type: "signal_received",
      signal,
      payload,
    });
  }

  /**
   * Creates a new workflow based on the provided options and returns the newly created workflow execution.
   * @param options the workflow creation options
   * @param input the workflow input
   */
  public async startWorkflow<TArgs extends Arg = Arg>(
    { alias, executionId }: WorkflowCreationOptions,
    input?: [...TArgs]
  ): Promise<WorkflowExecution> {
    const wkflowInstanceId = executionId ?? v4.generate();
    return await this.backend.withinTransaction(async (db) => {
      const execution = { alias, id: wkflowInstanceId };
      const executionsDB = db.execution(wkflowInstanceId);
      await executionsDB.create(execution); // cannot be parallelized
      await executionsDB.pending.add({
        ...newEvent(),
        type: "workflow_started",
        input,
      });
      return execution;
    });
  }

  /**
   * Typically to be used internally, runs the workflow and returns the workflow state.
   */
  public async runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    executionId: string
  ): Promise<WorkflowState<TArgs, TResult>> {
    return await this.backend.withinTransaction(async (db) => {
      const executionDB = db.execution(executionId);
      const maybeInstance = await executionDB.get();
      if (maybeInstance === undefined) {
        throw new Error("workflow not found");
      }
      const workflow = maybeInstance
        ? (this.registry.get(maybeInstance.alias) as
            | Workflow<TArgs, TResult>
            | undefined)
        : undefined;
      if (workflow === undefined) {
        throw new Error("workflow not found");
      }

      const [history, pendingEvents] = await Promise.all([
        executionDB.history.get(),
        executionDB.pending.get(),
      ]);
      const ctx = new WorkflowContext(executionId);
      const workflowFn: WorkflowGenFn<TArgs, TResult> = (
        ...args: [...TArgs]
      ): WorkflowGen<TResult> => {
        return workflow(ctx, ...args);
      };

      let state: WorkflowState<TArgs, TResult> = [
        ...history,
        ...pendingEvents,
      ].reduce(apply, zeroState(workflowFn));

      let lastSeq = history.length === 0 ? 0 : history[history.length - 1].seq;
      const newPending: HistoryEvent[] = [];
      const newHistory: HistoryEvent[] = pendingEvents;

      // this should be done by a command handler executor in background.
      while (
        !(
          state.hasFinished ||
          state.cancelledAt !== undefined ||
          state.current.isCompleted
        )
      ) {
        const newEvents = await state.current.run();
        state.current.changeState("Completed");
        newEvents.forEach((event) => {
          if (event.visibleAt) {
            newPending.push(event);
          } else {
            state = apply(state, event);
            newHistory.push(event);
          }
        });
      }
      if (state.hasFinished) {
        await executionDB.update({
          ...maybeInstance,
          result: state.result ?? state.exception,
          completedAt: new Date(),
        });
      }

      const historyPromise =
        newHistory.length === 0
          ? Promise.resolve()
          : executionDB.history.add(
              ...newHistory.map((event) => ({ ...event, seq: ++lastSeq }))
            );
      const deletePendingPromise =
        newHistory.length === 0
          ? Promise.resolve()
          : executionDB.pending.del(...newHistory);
      const pendingEventsPromise =
        newPending.length === 0
          ? Promise.resolve()
          : executionDB.pending.add(...newPending);

      await Promise.all([
        historyPromise,
        deletePendingPromise,
        pendingEventsPromise,
      ]);
      return state;
    });
  }
}
