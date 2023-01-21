import { HistoryEvent } from "./events.ts";

export interface Completed {
  result: unknown;
}
/**
 * Any function that receives the history and returns new pending events is considered a workflow runner.
 */
export type WorkflowRunner = (
  executionId: string,
  history: HistoryEvent[],
  pending: HistoryEvent[],
) => Promise<HistoryEvent[] | Completed>;

export const hasCompleted = (
  events: HistoryEvent[] | Completed,
): events is Completed => {
  return (events as Completed).result !== undefined;
};
