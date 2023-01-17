import { HistoryEvent } from "../events.ts";
import { PromiseOrValue } from "../promise.ts";
import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";

/**
 * Events is the operation that can be executed against the events.
 */
export interface Events {
  add(...events: [...HistoryEvent[]]): Promise<void>;
  del(...events: [...HistoryEvent[]]): Promise<void>;
  get(visible?: boolean): Promise<HistoryEvent[]>;
}

/**
 * Instance is all operations that can be executed in a given instance.
 */
export interface Instance {
  pending: Events;
  history: Events;
  get(): Promise<WorkflowInstance | undefined>;
  create(instance: WorkflowInstance): Promise<void>;
  update(instance: WorkflowInstance): Promise<void>;
}

/**
 * PendingExecution is a locked workflow instance pending to be executed.
 */
export interface PendingExecution {
  instance: string;
  unlock: () => Promise<void>;
}

export interface DB {
  /**
   * instance returns the possible operations for a given instance.
   */
  instance(instanceId: string): Instance;
  /**
   * PendingExecutions returns all workflow instance that has pending events and lock all of them using the specified lock time.
   * @param lockTimeMS is the time that the workflow instance should be locked
   */
  pendingExecutions(lockTimeMS: number): Promise<PendingExecution[]>;
  /**
   * withintransaction executes commands inside a transaction providing the ACID guarantees
   * if the executor function returns an exception, the transaction should be rolled back, otherwise it should commit all changes atomically.
   * when executing the given function any operation should be inside a lock machanism avoiding double execution in progress.
   * @param f the execution func
   */
  withinTransaction<T>(f: (transactor: DB) => PromiseOrValue<T>): Promise<T>;
}

export interface WorkflowInstance<TResult = unknown> {
  id: string;
  alias: string;
  completedAt?: Date;
  result?: TResult;
}

export interface HandlerOpts {
  cancellation: Event;
  concurrency: number;
}
