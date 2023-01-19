import { Command, NoOpCommand } from "./commands.ts";
import { Arg } from "../../../types.ts";
import { WorkflowGen, WorkflowGenFn } from "./workflow.ts";

/**
 * WorkflowState is the current state of the workflow for execution.
 */
export interface WorkflowState<TArgs extends Arg = Arg, TResult = unknown> {
  current: Command;
  workflowFn: WorkflowGenFn<TArgs, TResult>;
  hasFinished?: boolean;
  input?: TArgs;
  result?: TResult;
  exception?: unknown;
  startedAt?: Date;
  finishedAt?: Date;
  cancelledAt?: Date;
  generatorFn?: WorkflowGen<TResult>;
  signals: Record<string, WorkflowGen<TResult> | undefined>;
}

/**
 * zeroState returns a zero state for each workflow execution.
 * @param workflowFn the workflow function
 * @returns the zero state for the workflow
 */
export function zeroState<TArgs extends Arg = Arg, TResult = unknown>(
  workflowFn: WorkflowGenFn<TArgs, TResult>,
): WorkflowState<TArgs, TResult> {
  return {
    current: new NoOpCommand(),
    signals: {},
    workflowFn,
  };
}
