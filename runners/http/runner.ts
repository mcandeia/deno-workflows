import { HistoryEvent } from "../../workers/events.ts";
import { Completed, WorkflowRunner } from "../../workers/runner.ts";

export const httpRunnerFor = (url: string): WorkflowRunner => {
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
