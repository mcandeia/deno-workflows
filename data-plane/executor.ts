import { HistoryEvent } from "../events.ts";

export interface Completed {
  result: unknown;
}
/**
 * Any function that receives the history and returns new pending events is considered a workflow executor.
 */
export type WorkflowExecutor = (
  executionId: string,
  history: HistoryEvent[],
  pending: HistoryEvent[]
) => Promise<HistoryEvent[] | Completed>;