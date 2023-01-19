import { apply, HistoryEvent } from "../../events.ts";
import { Completed, WorkflowExecutor } from "../executor.ts";
import { WorkflowContext } from "../../context.ts";
import { WorkflowState, zeroState } from "../../state.ts";
import { WorkflowGenFn, WorkflowGen, Workflow } from "../../workflow.ts";
import { Arg } from "../../types.ts";

export const builtInFor =
  <TArgs extends Arg = Arg, TResult = unknown>(
    workflow: Workflow<TArgs, TResult>
  ): WorkflowExecutor =>
  async (
    executionId: string,
    history: HistoryEvent[],
    pendingEvents: HistoryEvent[]
  ): Promise<HistoryEvent[] | Completed> => {
    const ctx = new WorkflowContext(executionId);
    const workflowFn: WorkflowGenFn<TArgs, TResult> = (
      ...args: [...TArgs]
    ): WorkflowGen<TResult> => {
      return workflow(ctx, ...args);
    };

    const state: WorkflowState<TArgs, TResult> = [
      ...history,
      ...pendingEvents,
    ].reduce(apply, zeroState(workflowFn));

    if (state.cancelledAt !== undefined) {
      return [];
    }

    if (state.hasFinished) {
      return {
        result: state.result,
      };
    }

    return await state.current.run();
  };
