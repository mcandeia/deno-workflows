import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { Backend, TransactionExecutor } from "../backend.ts";
import { usePool } from "./connect.ts";
import {
  queryEvents,
  insertEvents,
  PersistedEvent,
  toHistoryEvent,
  deleteEvents,
} from "./events.ts";
import schema from "./schema.ts";
import { dbTransaction } from "./transaction.ts";

await usePool((client) => {
  return client.queryObject(schema);
}); // creating db schema.

const TABLE_HISTORY = "history";
const TABLE_PENDING_EVENTS = "pending_events";
const queryPendingEvents = queryEvents(TABLE_PENDING_EVENTS, true);
const queryHistory = queryEvents(TABLE_HISTORY);
const insertPendingEvents = insertEvents(TABLE_PENDING_EVENTS);
const insertHistory = insertEvents(TABLE_HISTORY);
const deletePendingEvents = deleteEvents(TABLE_PENDING_EVENTS);

export function postgre(): Backend {
  const withinTransaction = async function <T>(
    instanceId: string,
    withLock: (
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[],
      executor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T> {
    return await dbTransaction(
      async (db) => {
        const [pendingEvents, history] = await Promise.all([
          db.queryObject<PersistedEvent>(queryPendingEvents(instanceId)),
          db.queryObject<PersistedEvent>(queryHistory(instanceId)),
        ]);
        const newHistoryEvents: HistoryEvent[] = [];
        const newPendingEvents: HistoryEvent[] = [];
        const result = await withLock(
          history.rows.map(toHistoryEvent),
          pendingEvents.rows.map(toHistoryEvent),
          {
            add: (events: HistoryEvent[]) => {
              newHistoryEvents.push.apply(newHistoryEvents, events);
            },
            addPending: (events: HistoryEvent[]) => {
              newPendingEvents.push.apply(newPendingEvents, events);
            },
          }
        );
        if (newHistoryEvents.length != 0) {
          await Promise.all([
            db.queryObject(deletePendingEvents(instanceId, newHistoryEvents)),
            db.queryObject(insertHistory(instanceId, newHistoryEvents)),
          ]);
        }
        if (newPendingEvents.length != 0) {
          await db.queryObject(
            insertPendingEvents(instanceId, newPendingEvents)
          );
        }
        return result;
      },
      `${instanceId}_transaction`,
      { isolation_level: "repeatable_read" }
    );
  };
  return { withinTransaction };
}
