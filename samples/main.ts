import { postgres } from "../backends/postgres/db.ts";
import { WorkflowService } from "../service/workflow.ts";

const backend = postgres();
export const workflowService = new WorkflowService(backend);
export const totalWorkflowRuns = 30;
export const orderForm = { items: ["soap", "shirt"] };
