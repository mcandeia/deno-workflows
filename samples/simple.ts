import { ActivityResult, WorkflowContext } from "../workflow/context.ts";
import { runWorkflow, storage } from "../workflow/executor.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function plsSum(
  _: WorkflowContext,
  a: number,
  b: number
): Promise<number> {
  console.log("CALLING ACTIVITY PLSSUM");
  await sleep(1000);
  console.log("CALLING ACTIVITY PLSSUM1");
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
const resp = await runWorkflow(
  workflowInstanceId,
  function* (ctx: WorkflowContext) {
    const resp: number = yield ctx.callActivity(plsSum, 10, 20);
    return resp;
  }
);
console.log(resp);
console.log(storage);

await sleep(5000);

const resp2 = await runWorkflow(
  workflowInstanceId,
  function* (ctx: WorkflowContext) {
    const resp: number = yield ctx.callActivity(plsSum, 10, 20);
    return resp;
  }
);

console.log(resp2);
console.log(storage);
