import { storage } from "../backend.ts";
import { WorkflowContext } from "../context.ts";
import { backend, runWorkflow } from "../executor.ts";
import { sleep } from "../utils.ts";

let called = 0;
async function plsSum(
  _: WorkflowContext,
  a: number,
  b: number
): Promise<number> {
  called++;
  await sleep(1000);
  return a + b;
}

const workflowInstanceId = "test";
await backend.createWorkflowInstance(
  { instanceId: workflowInstanceId },
  {
    id: workflowInstanceId,
    timestamp: new Date(),
    type: "workflow_started",
  }
);
const myworkflow = function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(plsSum, 10, 20);
  const resp2: number = yield ctx.callActivity(plsSum, 30, 20);
  return resp + resp2;
};

const resp = await runWorkflow(workflowInstanceId, myworkflow);
console.log(resp);
console.log(called);
const resp2 = await runWorkflow(workflowInstanceId, myworkflow);
console.log(resp2);
console.log(called);

console.log(storage);
