import { postgres } from "../backends/postgres/db.ts";
import { WorkflowContext } from "../context.ts";
import { WorkflowService } from "../service/workflow.ts";
import { sleep } from "../utils.ts";

const backend = postgres();
const workflowService = new WorkflowService(backend);
// any activity
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

// workflow definition
const myworkflow = function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(plsSum, 10, 20);
  yield ctx.sleep(5000);
  const resp2: number = yield ctx.callActivity(plsSum, 30, 20);
  return resp + resp2;
};

// workflow register
workflowService.registerWorkflow(myworkflow);

// running workflows
const { id } = await workflowService.startWorkflow({
  alias: myworkflow.name,
});

const resp = await workflowService.runWorkflow(id);
console.log(resp);
console.log(called);

await sleep(5000);

const resp2 = await workflowService.runWorkflow(id);
console.log(resp2);
console.log(called);

console.log("RESULT =>", resp2.result);
