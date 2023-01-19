import { Handler } from "https://deno.land/std@0.173.0/http/server.ts";
import { HistoryEvent } from "./workers/events.ts";
import { denoExecutor } from "./workers/executors/deno/executor.ts";
import { Workflow } from "./workers/executors/deno/workflow.ts";

export interface RunRequest {
  executionId: string;
  history: HistoryEvent[];
  pendingEvents: HistoryEvent[];
}

/**
 * Exposes a workflow function as a http handler.
 * @param workflow the workflow function
 * @returns a http handler
 */
export const workflowHTTPHandler = (workflow: Workflow): Handler => {
  const executor = denoExecutor(workflow);
  return async function (req) {
    const { executionId, history, pendingEvents } = await req
      .json() as RunRequest;

    return Response.json(await executor(executionId, history, pendingEvents));
  };
};
