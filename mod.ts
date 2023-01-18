import { WorkflowService } from "./service/workflow.ts";
import { postgres } from "./backends/postgres/db.ts";
import { tryParseBool } from "./utils.ts";
export const DEBUG_ENABLED =
  tryParseBool(Deno.env.get("ENABLE_DEBUG")) ?? false;
export { WorkflowService, postgres };
