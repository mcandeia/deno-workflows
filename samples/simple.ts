import { ActivityResult, WorkflowContext } from "../workflow/context.ts";
import { runWorkflow } from "../workflow/executor.ts";

function plsSum(_: WorkflowContext, a: number, b: number): number {
  console.log("CALLING ACTIVITY PLSSUM");
  return a + b;
}

function* sum(
  ctx: WorkflowContext,
  a: number,
  b: number
): ActivityResult<number> {
  console.log("CALLING ACTIVITY SUM");
  return yield ctx.callActivity(plsSum, a, b);
}
const workflowInstanceId = "test";
const resp = runWorkflow(function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(sum, 10, 20);
  return resp;
}, workflowInstanceId);

console.log(resp);
const resp2 = runWorkflow(function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(sum, 10, 20);
  return resp;
}, workflowInstanceId);

console.log(resp2);
