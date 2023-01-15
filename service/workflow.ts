import { Backend, WorkflowInstance } from "../backends/backend.ts";
import { WorkflowContext } from "../context.ts";
import { HistoryEvent, apply, newEvent } from "../events.ts";
import { WorkflowState, zeroState } from "../state.ts";
import { Arg } from "../types.ts";
import { Workflow, WorkflowGen, WorkflowGenFn } from "../workflow.ts";
import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";

export class WorkflowService {
  protected registry: Map<string, Workflow>;
  constructor(protected backend: Backend) {
    this.registry = new Map();
  }

  public registerWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    wkf: Workflow<TArgs, TResult>,
    alias?: string
  ): void {
    this.registry.set(alias ?? wkf.name, wkf as Workflow);
  }

  public async startWorkflow<TArgs extends Arg = Arg>(
    { alias, instanceId }: { alias: string; instanceId?: string },
    input?: [...TArgs]
  ): Promise<WorkflowInstance> {
    const wkflowInstanceId = instanceId ?? v4.generate();
    return await this.backend.withinTransaction(
      wkflowInstanceId,
      (_, __, ___, { addPending, setInstance }) => {
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

  public async runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
    instanceId: string
  ): Promise<WorkflowState<TArgs, TResult>> {
    return await this.backend.withinTransaction(
      instanceId,
      async (
        maybeInstance,
        events,
        pendingEvents: HistoryEvent[],
        { addPending, add, setInstance }
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
            result: state.result,
            completedAt: new Date(),
          });
        }
        return state;
      }
    );
  }
}
