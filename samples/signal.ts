import { workflowService, totalWorkflowRuns, orderForm } from "./main.ts";

for (let i = 0; i < totalWorkflowRuns; i++) {
  await workflowService.signalWorkflow(`${i}`, "order_created", {
    ...orderForm,
    id: i,
  });
}
