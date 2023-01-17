import { HandlerOpts, WorkflowInstance } from "../backends/backend.ts";
import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";
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
 * WorkflowCreationOptions is used for creating workflows of a given instanceId.
 */
export interface WorkflowCreationOptions {
  instanceId?: string;
  alias: string;
}

const MAX_LOCK_MINUTES =
  tryParseInt(Deno.env.get("WORKERS_LOCK_MINUTES")) ?? 10;

const DELAY_WHEN_NO_PENDING_EVENTS_MS =
  tryParseInt(Deno.env.get("PG_INTERVAL_EMPTY_EVENTS")) ?? 5_000;

async function* instancesGenerator(
  db: DB,
  cancellation: Event
): AsyncGenerator<WorkItem<string>, void, unknown> {
  while (!cancellation.is_set()) {
    const instanceIds = await Promise.race([
      db.pendingExecutions(MAX_LOCK_MINUTES),
      cancellation.wait(),
    ]);

    if (instanceIds == true) {
      break;
    }

    if (instanceIds.length == 0) {
      await delay(DELAY_WHEN_NO_PENDING_EVENTS_MS);
    }

    for (const { instance: item, unlock } of instanceIds) {
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
  public startWorkers(opts?: HandlerOpts) {
    startWorkers(
      (async (instanceId: string) => {
        await this.runWorkflow(instanceId);
      }).bind(this),
      instancesGenerator(this.backend, opts?.cancellation ?? new Event()),
      opts?.concurrency ?? 1
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
    instanceId: string,
    signal: string,
    payload?: unknown
  ): Promise<void> {
    await this.backend.instance(instanceId).pending.add({
      ...newEvent(),
      type: "signal_received",
      signal,
      payload,
    });
  }

  /**
   * Creates a new workflow based on the provided options and returns the newly created workflow instance.
   * @param options the workflow creation options
   * @param input the workflow input
   */
  public async startWorkflow<TArgs extends Arg = Arg>(
    { alias, instanceId }: WorkflowCreationOptions,
    input?: [...TArgs]
  ): Promise<WorkflowInstance> {
    const wkflowInstanceId = instanceId ?? v4.generate();
    return await this.backend.withinTransaction(async (db) => {
      const instance = { alias, id: wkflowInstanceId };
      const instancesDB = db.instance(wkflowInstanceId);
      await instancesDB.create(instance); // cannot be parallelized
      await instancesDB.pending.add({
        ...newEvent(),
        type: "workflow_started",
        input,
      });
      return instance;
    });
  }

  /**
   * Typically to be used internally, runs the workflow and returns the workflow state.
   */
  public async runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    instanceId: string
  ): Promise<WorkflowState<TArgs, TResult>> {
    return await this.backend.withinTransaction(async (db) => {
      const instanceDB = db.instance(instanceId);
      const maybeInstance = await instanceDB.get();
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

      const [events, pendingEvents] = await Promise.all([
        instanceDB.history.get(),
        instanceDB.pending.get(true),
      ]);
      const ctx = new WorkflowContext(instanceId);
      const workflowFn: WorkflowGenFn<TArgs, TResult> = (
        ...args: [...TArgs]
      ): WorkflowGen<TResult> => {
        return workflow(ctx, ...args);
      };

      let state: WorkflowState<TArgs, TResult> = [
        ...events,
        ...pendingEvents,
      ].reduce(apply, zeroState(workflowFn));

      await Promise.all([
        instanceDB.history.add(...pendingEvents),
        instanceDB.pending.del(...pendingEvents),
      ]);

      const newPending: HistoryEvent[] = [];
      const history: HistoryEvent[] = [];
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
            history.push(event);
          }
        });
      }
      if (state.hasFinished) {
        await instanceDB.update({
          ...maybeInstance,
          result: state.result ?? state.exception,
          completedAt: new Date(),
        });
      }

      const historyPromise =
        history.length === 0
          ? Promise.resolve()
          : instanceDB.history.add(...history);
      const pendingEventsPromise =
        newPending.length === 0
          ? Promise.resolve()
          : instanceDB.pending.add(...newPending);

      await Promise.all([historyPromise, pendingEventsPromise]);
      return state;
    });
  }
}
