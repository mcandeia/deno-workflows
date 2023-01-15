import { randomInt } from "https://raw.githubusercontent.com/alextes/vegas/main/mod.ts";
import { storage } from "../backends/memory/db.ts";
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

const workflowInstanceId = "test" + randomInt(0, 10000000);
await backend.withinTransaction(workflowInstanceId, (_, __, { addPending }) => {
  addPending([
    {
      id: workflowInstanceId,
      timestamp: new Date(),
      type: "workflow_started",
    },
  ]);
});

const myworkflow = function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(plsSum, 10, 20);
  yield ctx.sleep(5000);
  const resp2: number = yield ctx.callActivity(plsSum, 30, 20);
  return resp + resp2;
};

const resp = await runWorkflow(workflowInstanceId, myworkflow);
console.log(resp);
console.log(called);

await sleep(5000);

const resp2 = await runWorkflow(workflowInstanceId, myworkflow);
console.log(resp2);
console.log(called);

console.log(JSON.stringify(storage.get(workflowInstanceId)));

console.log("RESULT =>", resp2.result);
