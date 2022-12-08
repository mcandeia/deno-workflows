import {
  HistoryEvent,
  WorkflowCancelledEvent,
  WorkflowStartedEvent,
} from "./events.ts";
import { WorkflowInstance } from "./mod.ts";
import { Arg } from "./types.ts";
import { Mutex } from "https://deno.land/x/semaphore@v1.1.1/mod.ts";
import { PromiseOrValue } from "./promise.ts";

export interface TransactionExecutor {
  add(events: HistoryEvent[]): void;
}
/**
 * Backend is the storage backend used for the workflows.
 */
export interface Backend {
  /**
   * creates a new workflow instance
   * @param instance the workflow instance.
   * @param startedEvent the workflow started event
   */
  createWorkflowInstance<TArgs extends Arg = Arg>(
    instance: WorkflowInstance,
    startedEvent: WorkflowStartedEvent<TArgs>
  ): Promise<void>;
  /**
   * cancelWorkflowInstance cancels the current workflow instance
   * @param instance the workflow instance
   * @param cancelEvent the cancel event
   */
  cancelWorkflowInstance(
    instance: WorkflowInstance,
    cancelEvent: WorkflowCancelledEvent
  ): Promise<void>;

  /**
   * getWorkflowHistory returns the current workflow history for the given instance
   * @param instance the workflow instance
   * @returns the list of history events
   */
  getWorkflowInstanceHistory(
    instance: WorkflowInstance
  ): Promise<HistoryEvent[]>;

  /**
   * signal the given workflow instance with the given event.
   * @param instanceId
   * @param event the signal event.
   */
  signalWorkflow(instanceId: string, event: HistoryEvent): Promise<void>;

  /**
   * within transaction executes commands inside a transaction and returns the events.
   * @param instanceId the instance Id
   * @param exec the execution func
   */
  withinTransaction<T>(
    instanceId: string,
    exec: (
      events: HistoryEvent[],
      transactor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T>;
}

export const storage = new Map<string, HistoryEvent[]>();

export function inMemoryBackend(): Backend {
  const byInstanceMtx = new Map<string, Mutex>();
  const createMu = new Mutex();
  const withinTransaction = async function <T>(
    instanceId: string,
    withLock: (
      events: HistoryEvent[],
      executor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T> {
    let mtx = byInstanceMtx.get(instanceId);
    if (!mtx) {
      const release = await createMu.acquire();
      mtx = byInstanceMtx.get(instanceId);
      if (!mtx) {
        mtx = new Mutex();
        byInstanceMtx.set(instanceId, mtx);
        storage.set(instanceId, []);
      }
      release();
    }
    const events = storage.get(instanceId) ?? [];
    const executor = {
      add: function (newEvents: HistoryEvent[]) {
        events.push.apply(events, newEvents);
      },
    };
    const release = await mtx.acquire();
    const result = await withLock(storage.get(instanceId) ?? [], executor);
    storage.set(instanceId, events);
    release();
    return result;
  };
  return {
    withinTransaction: withinTransaction,
    cancelWorkflowInstance: async function (
      { instanceId }: WorkflowInstance,
      cancelEvent: WorkflowCancelledEvent
    ): Promise<void> {
      await withinTransaction(instanceId, (_, { add }) => {
        return add([cancelEvent]);
      });
    },
    createWorkflowInstance: async function <TArgs extends Arg = Arg>(
      { instanceId }: WorkflowInstance,
      startedEvent: WorkflowStartedEvent<TArgs>
    ): Promise<void> {
      await withinTransaction(instanceId, (_, { add }) => {
        return add([startedEvent]);
      });
    },
    getWorkflowInstanceHistory: function ({
      instanceId,
    }: WorkflowInstance): Promise<HistoryEvent[]> {
      return Promise.resolve(storage.get(instanceId) ?? []);
    },
    signalWorkflow: async function (
      instanceId: string,
      event: HistoryEvent
    ): Promise<void> {
      await withinTransaction(instanceId, (_, { add }) => add([event]));
    },
  };
}
