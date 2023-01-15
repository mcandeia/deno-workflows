import { Mutex } from "https://deno.land/x/semaphore@v1.1.1/mod.ts";
import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { identity } from "../../utils.ts";
import { TransactionExecutor, WorkflowInstance } from "../backend.ts";
import { Backend } from "../backend.ts";

interface Instance {
  events: HistoryEvent[];
  pendingEvents: HistoryEvent[];
  instance: WorkflowInstance;
}
export const storage = new Map<string, Instance>();

export function inMemoryBackend(): Backend {
  const byInstanceMtx = new Map<string, Mutex>();
  const createMu = new Mutex();
  const withinTransaction = async function <T>(
    instanceId: string,
    withLock: (
      instance: WorkflowInstance,
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[],
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
        storage.set(instanceId, {
          events: [],
          pendingEvents: [],
          instance: { alias: "", id: "" },
        });
      }
      release();
    }
    const release = await mtx.acquire();
    const { events, pendingEvents, instance } = storage.get(instanceId) ?? {
      events: [],
      pendingEvents: [],
      instance: { alias: "", id: "" },
    };
    let currInstance = instance;
    const pendingMap = new Map<string, HistoryEvent>();
    pendingEvents.forEach((event) => {
      pendingMap.set(event.id, event);
    });
    const executor = {
      addPending: function (newEvents: HistoryEvent[]) {
        newEvents.forEach((event) => {
          pendingMap.set(event.id, event);
        });
      },
      add: function (newEvents: HistoryEvent[]) {
        newEvents.forEach((event) => {
          pendingMap.delete(event.id);
          events.push(event);
        });
      },
      setInstance: function (newInstance: WorkflowInstance) {
        currInstance = newInstance;
      },
    };
    const result = await withLock(
      currInstance,
      events.map(identity),
      pendingEvents.filter(({ visibleAt }) => {
        if (visibleAt) {
          return visibleAt.getTime() <= Date.now();
        }
        return true;
      }),
      executor
    );
    storage.set(instanceId, {
      events,
      pendingEvents: Array.from(pendingMap.values()),
      instance: currInstance,
    });
    release();
    return result;
  };
  return {
    withinTransaction,
  };
}
