import { WorkflowContext } from "../context.ts";
import { delay } from "https://deno.land/std@0.160.0/async/delay.ts";

// any activity
async function plsSum(a: number, b: number): Promise<number> {
  await delay(1000);
  return a + b;
}

// workflow definition
export const sumWithDelayWorkflow = function* (ctx: WorkflowContext) {
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

export const createOrderWorkflow = function* (
  ctx: WorkflowContext,
  orderForm: OrderForm
) {
  yield ctx.callActivity(createOrder, orderForm);
  yield* sumWithDelayWorkflow(ctx);
  const orderCreated: Order = yield ctx.waitForSignal("order_created");
  return orderCreated.id;
};
