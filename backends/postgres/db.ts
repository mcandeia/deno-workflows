import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { Backend, TransactionExecutor, WorkflowInstance } from "../backend.ts";
import { usePool } from "./connect.ts";
import {
  queryEvents,
  insertEvents,
  PersistedEvent,
  toHistoryEvent,
  deleteEvents,
} from "./events.ts";
import { getInstance, insertInstance, updateInstance } from "./instance.ts";
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

export function postgres(): Backend {
  const withinTransaction = async function <T>(
    instanceId: string,
    withLock: (
      instance: WorkflowInstance,
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[],
      executor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T> {
    return await dbTransaction(
      async (db) => {
        const [
          pendingEvents,
          history,
          {
            rows: [instance],
          },
        ] = await Promise.all([
          db.queryObject<PersistedEvent>(queryPendingEvents(instanceId)),
          db.queryObject<PersistedEvent>(queryHistory(instanceId)),
          db.queryObject<WorkflowInstance>(getInstance(instanceId)),
        ]);
        const newHistoryEvents: HistoryEvent[] = [];
        const newPendingEvents: HistoryEvent[] = [];
        let instanceSet: WorkflowInstance | undefined = undefined;
        const result = await withLock(
          instance,
          history.rows.map(toHistoryEvent),
          pendingEvents.rows.map(toHistoryEvent),
          {
            add: (events: HistoryEvent[]) => {
              newHistoryEvents.push.apply(newHistoryEvents, events);
            },
            addPending: (events: HistoryEvent[]) => {
              newPendingEvents.push.apply(newPendingEvents, events);
            },
            setInstance: (instance: WorkflowInstance) => {
              instanceSet = instance;
            },
          }
        );
        if (instanceSet !== undefined) {
          const updateStatement =
            instance === undefined ? insertInstance : updateInstance;
          await db.queryObject(updateStatement(instanceId, instanceSet));
        }
        const ops: Promise<unknown>[] = [];
        if (newHistoryEvents.length != 0) {
          ops.push(
            db.queryObject(deletePendingEvents(instanceId, newHistoryEvents))
          );
          ops.push(db.queryObject(insertHistory(instanceId, newHistoryEvents)));
        }
        if (newPendingEvents.length != 0) {
          ops.push(
            db.queryObject(insertPendingEvents(instanceId, newPendingEvents))
          );
        }
        await Promise.all(ops);
        return result;
      },
      `${instanceId}_transaction`,
      { isolation_level: "repeatable_read" }
    );
  };
  return { withinTransaction };
}
