import { inMemoryBackend } from "./backends/memory/db.ts";
import { WorkflowContext } from "./context.ts";
import { apply, HistoryEvent } from "./events.ts";
import { WorkflowState, zeroState } from "./state.ts";
import { Arg } from "./types.ts";
import { Workflow, WorkflowGenFn, WorkflowGen } from "./workflow.ts";

export const backend = inMemoryBackend();

export function runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
  instanceId: string,
  workflow: Workflow<TArgs, TResult>
): Promise<WorkflowState<TArgs, TResult>> {
  return backend.withinTransaction(
    instanceId,
    async (events, pendingEvents: HistoryEvent[], { addPending, add }) => {
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
      return state;
    }
  );
}
