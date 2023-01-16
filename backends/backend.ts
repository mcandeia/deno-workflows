import { HistoryEvent } from "../events.ts";
import { PromiseOrValue } from "../promise.ts";
import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";

export interface WorkflowInstance<TResult = unknown> {
  id: string;
  alias: string;
  completedAt?: Date;
  result?: TResult;
}

export interface TransactionExecutor {
  add(events: HistoryEvent[]): void;
  addPending(events: HistoryEvent[]): void;
  setInstance(instance: WorkflowInstance): void;
}

export interface HandlerOpts {
  cancellation: Event;
  concurrency: number;
}

/**
 * Backend is the storage backend used for the workflows.
 */
export interface Backend {
  /**
   * onPendingEvent dispatches the handler function whenever a pending event arrives for the target instanceId.
   * Works in a at-least-once delivery fashion.
   * @param handler the handler func
   */
  onPendingEvent(
    handler: (instanceId: string) => Promise<void>,
    opts?: HandlerOpts
  ): void;
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
      transactor: TransactionExecutor,
      instance: WorkflowInstance | undefined,
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[]
    ) => PromiseOrValue<T>
  ): Promise<T>;
}
