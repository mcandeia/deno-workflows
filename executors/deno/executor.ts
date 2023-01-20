import { WorkflowContext } from "../../context.ts";
import { Arg } from "../../types.ts";
import { HistoryEvent } from "../../workers/events.ts";
import { Completed, WorkflowExecutor } from "../../workers/executor.ts";
import { apply } from "./events.ts";
import { WorkflowState, zeroState } from "./state.ts";
import { Workflow, WorkflowGen, WorkflowGenFn } from "./workflow.ts";

export const denoExecutor = <TArgs extends Arg = Arg, TResult = unknown>(
  workflow: Workflow<TArgs, TResult>,
): WorkflowExecutor =>
async (
  executionId: string,
  history: HistoryEvent[],
  pendingEvents: HistoryEvent[],
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
