import { Backend, HandlerOpts, WorkflowInstance } from "../backends/backend.ts";
import { WorkflowContext } from "../context.ts";
import { HistoryEvent, apply, newEvent } from "../events.ts";
import { WorkflowState, zeroState } from "../state.ts";
import { Arg } from "../types.ts";
import { Workflow, WorkflowGen, WorkflowGenFn } from "../workflow.ts";
import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";

/**
 * WorkflowCreationOptions is used for creating workflows of a given instanceId.
 */
export interface WorkflowCreationOptions {
  instanceId?: string;
  alias: string;
}

export class WorkflowService {
  protected registry: Map<string, Workflow>;
  constructor(protected backend: Backend) {
    this.registry = new Map();
  }

  /**
   * start the background workers.
   */
  public startWorkers(opts?: HandlerOpts) {
    this.backend.onPendingEvent(
      (async (instanceId: string) => {
        await this.runWorkflow(instanceId);
      }).bind(this),
      opts
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
    return await this.backend.withinTransaction(
      instanceId,
      ({ addPending }) => {
        addPending([
          {
            ...newEvent(),
            type: "signal_received",
            signal,
            payload,
          },
        ]);
      }
    );
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
    return await this.backend.withinTransaction(
      wkflowInstanceId,
      ({ addPending, setInstance }) => {
        const instance = { alias, id: wkflowInstanceId };
        setInstance(instance);
        addPending([
          {
            ...newEvent(),
            type: "workflow_started",
            input,
          },
        ]);
        return { alias, id: wkflowInstanceId };
      }
    );
  }

  /**
   * Typically to be used internally, runs the workflow and returns the workflow state.
   */
  public async runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    instanceId: string
  ): Promise<WorkflowState<TArgs, TResult>> {
    return await this.backend.withinTransaction(
      instanceId,
      async (
        { addPending, add, setInstance },
        maybeInstance,
        events,
        pendingEvents: HistoryEvent[]
      ) => {
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

        add(pendingEvents);

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
              addPending([event]);
            } else {
              state = apply(state, event);
              add([event]);
            }
          });
        }
        if (state.hasFinished) {
          setInstance({
            ...maybeInstance,
            result: state.result ?? state.exception,
            completedAt: new Date(),
          });
        }
        return state;
      }
    );
  }
}
