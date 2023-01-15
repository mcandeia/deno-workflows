import { HistoryEvent } from "../events.ts";
import { PromiseOrValue } from "../promise.ts";

export interface WorkflowInstance<TResult = unknown> {
  id: string;
  alias: string;
  completedAt?: Date;
  result?: TResult;
}
export interface TransactionExecutor {
  add(events: HistoryEvent[]): void;
  addPending(events: HistoryEvent[]): void;
  setInstance(alias: WorkflowInstance): void;
}

/**
 * Backend is the storage backend used for the workflows.
 */
export interface Backend {
  /**
   * within transaction executes commands inside a transaction providing the ACID guarantees
   * if the executor function returns an exception, the transaction should be rolled back, otherwise it should commit all changes atomically.
   * when executing the given function any operation should be inside a lock machanism avoiding double execution in progress.
   * @param instanceId the instance Id
   * @param exec the execution func
   */
  withinTransaction<T>(
    instanceId: string,
    exec: (
      instance: WorkflowInstance | undefined,
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[],
      transactor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T>;
}
