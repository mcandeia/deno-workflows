import { postgres } from "../backends/postgres/db.ts";
import { WorkflowContext } from "../context.ts";
import { WorkflowService } from "../service/workflow.ts";
import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";
import { delay } from "https://deno.land/std@0.160.0/async/delay.ts";

const backend = postgres();
const workflowService = new WorkflowService(backend);
// any activity
let called = 0;
async function plsSum(a: number, b: number): Promise<number> {
  called++;
  await delay(1000);
  return a + b;
}

// workflow definition
const sumWithDelayWorkflow = function* (ctx: WorkflowContext) {
  const resp: number = yield ctx.callActivity(plsSum, 10, 20);
  yield ctx.sleep(5000);
  const resp2: number = yield ctx.callActivity(plsSum, 30, 20);
  return resp + resp2;
};
// create order workflow

interface OrderForm {
  items: string[];
}
interface Order extends OrderForm {
  id: string;
}
async function createOrder(form: OrderForm): Promise<void> {
  console.log("Received orderForm", form);
  await delay(5000); // faking some delay
}
const createOrderWorkflow = function* (
  ctx: WorkflowContext,
  orderForm: OrderForm
) {
  yield ctx.callActivity(createOrder, orderForm);
  const orderCreated: Order = yield ctx.waitForSignal("order_created");
  return orderCreated.id;
};
// workflow register
workflowService.registerWorkflow(sumWithDelayWorkflow);
workflowService.registerWorkflow(createOrderWorkflow);
const cancellation = new Event();
workflowService.startWorkers({ cancellation, concurrency: 10 });

const orderForm = { items: ["soap", "shirt"] };

const promises = [];
for (let i = 0; i < 30; i++) {
  const mId = i;
  promises.push(
    workflowService
      .startWorkflow(
        {
          alias: createOrderWorkflow.name,
          instanceId: `${i}`,
        },
        [orderForm]
      )
      .then(async ({ id }) => {
        await delay(10_000);
        await workflowService.signalWorkflow(id, "order_created", {
          ...orderForm,
          id: mId,
        });
      })
  );
}
// running workflows
await Promise.all(promises);
console.log("waiting 10 seconds");

// await sleep(8000);

// const resp = await workflowService.runWorkflow(id);
// console.log(resp);
// console.log(called);

// console.log("RESULT =>", resp.result);
await delay(100_000);
