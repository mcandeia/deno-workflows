import { HistoryEvent } from "../../events.ts";
import { Completed, WorkflowExecutor } from "../../executor.ts";

export const httpExecutorFor = (url: string): WorkflowExecutor => {
  return async (
    executionId,
    history,
    pendingEvents,
  ): Promise<HistoryEvent[] | Completed> => {
    const resp = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        executionId,
        history,
        pendingEvents,
      }),
    });
    if (resp.status >= 400) {
      throw new Error(
        `invalid status code ${resp.status} for ${url}, ${executionId}`,
      );
    }
    return await resp.json();
  };
};
