import { inMemoryBackend } from "./backend.ts";
import { WorkflowContext } from "./context.ts";
import { apply } from "./events.ts";
import { WorkflowState, zeroState } from "./state.ts";
import { Arg } from "./types.ts";
import { Workflow, WorkflowGenFn, WorkflowGen } from "./workflow.ts";

export const backend = inMemoryBackend();

export function runWorkflow<TArgs extends Arg = Arg, TResult = unknown>(
  instanceId: string,
  workflow: Workflow<TArgs, TResult>
): Promise<WorkflowState<TArgs, TResult>> {
  return backend.withinTransaction(instanceId, async (events, { add }) => {
    const ctx = new WorkflowContext(instanceId);
    const workflowFn: WorkflowGenFn<TArgs, TResult> = (
      ...args: [...TArgs]
    ): WorkflowGen<TResult> => {
      return workflow(ctx, ...args);
    };

    let state: WorkflowState<TArgs, TResult> = events.reduce(
      apply,
      zeroState(workflowFn)
    );

    // this should be done by a command handler executor in background.
    while (
      !(
        state.hasFinished ||
        state.cancelledAt !== undefined ||
        state.current.isCompleted
      )
    ) {
      const newEvents = await state.current.run(backend);
      state = newEvents.reduce(apply, state);
      add(newEvents);
    }
    return state;
  });
}
