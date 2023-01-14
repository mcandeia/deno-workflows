import { Mutex } from "https://deno.land/x/semaphore@v1.1.1/mod.ts";
import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { identity } from "../../utils.ts";
import { TransactionExecutor } from "../backend.ts";
import { Backend } from "../backend.ts";

export const storage = new Map<
  string,
  { events: HistoryEvent[]; pendingEvents: HistoryEvent[] }
>();

export function inMemoryBackend(): Backend {
  const byInstanceMtx = new Map<string, Mutex>();
  const createMu = new Mutex();
  const withinTransaction = async function <T>(
    instanceId: string,
    withLock: (
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
        storage.set(instanceId, { events: [], pendingEvents: [] });
      }
      release();
    }
    const release = await mtx.acquire();
    const { events, pendingEvents } = storage.get(instanceId) ?? {
      events: [],
      pendingEvents: [],
    };
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
    };
    const result = await withLock(
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
    });
    release();
    return result;
  };
  return {
    withinTransaction,
  };
}
