import { tryParseBool } from "./utils.ts";
import { WorkflowContext } from "./context.ts";
import { workflowHTTPHandler } from "./handler.ts";
import type { Workflow } from "./workers/executors/deno/workflow.ts";
const DEBUG_ENABLED = tryParseBool(Deno.env.get("ENABLE_DEBUG")) ??
  false;

export { DEBUG_ENABLED, Workflow, WorkflowContext, workflowHTTPHandler };
