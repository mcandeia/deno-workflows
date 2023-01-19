import { workflowService, totalWorkflowRuns, orderForm } from "./main.ts";

const promises = [];
for (let i = 0; i < totalWorkflowRuns; i++) {
  promises.push(
    workflowService.startWorkflow(
      {
        alias: "createOrderWorkflow",
        executionId: `${i}`,
      },
      [orderForm]
    )
  );
}
// running workflows
await Promise.all(promises);
