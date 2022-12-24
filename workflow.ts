import { Command } from "./commands.ts";
import { WorkflowContext } from "./context.ts";
import { Arg } from "./types.ts";

export type WorkflowGen<TResp extends unknown = unknown> = Generator<
  Command,
  TResp,
  // deno-lint-ignore no-explicit-any
  any
>;

export type WorkflowGenFn<
  TArgs extends Arg = Arg,
  TResp extends unknown = unknown
> = (...args: [...TArgs]) => WorkflowGen<TResp>;

export type NoArgWorkflowFn<TResp = unknown> = () => WorkflowGen<TResp>;

export const isNoArgFn = function <TArgs extends Arg = Arg, TResp = unknown>(
  fn: WorkflowGenFn<TArgs, TResp>
): fn is NoArgWorkflowFn<TResp> {
  return fn.length == 0;
};

export type Workflow<TArgs extends Arg = Arg, TResp = unknown> = (
  ctx: WorkflowContext,
  ...args: [...TArgs]
) => WorkflowGen<TResp>;
