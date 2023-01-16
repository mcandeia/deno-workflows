import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { startWorkers, WorkItem } from "../../worker/starter.ts";
import {
  Backend,
  HandlerOpts,
  TransactionExecutor,
  WorkflowInstance,
} from "../backend.ts";
import { usePool } from "./connect.ts";
import {
  queryEvents,
  insertEvents,
  PersistedEvent,
  toHistoryEvent,
  deleteEvents,
} from "./events.ts";
import {
  getInstance,
  insertInstance,
  pendingInstances,
  unlockInstance,
  updateInstance,
} from "./instances.ts";
import schema from "./schema.ts";
import { dbTransaction } from "./transaction.ts";
import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";
import { delay } from "https://deno.land/std@0.160.0/async/delay.ts";
import { tryParseInt } from "../../utils.ts";

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

const DELAY_WHEN_NO_PENDING_EVENTS_MS =
  tryParseInt(Deno.env.get("PG_INTERVAL_EMPTY_EVENTS")) ?? 5_000;

async function* instancesGenerator(
  cancellation: Event
): AsyncGenerator<WorkItem<string>, void, unknown> {
  return yield* await usePool(async function* (
    client
  ): AsyncGenerator<WorkItem<string>, void, unknown> {
    const unlockWkflowInstance = (instanceId: string) => () => {
      client.queryObject(unlockInstance(instanceId));
    };
    while (!cancellation.is_set()) {
      const instanceIds = await Promise.race([
        client
          .queryObject<{ id: string }>(pendingInstances)
          .then((r) => r.rows.map((instance) => instance.id)),
        cancellation.wait(),
      ]);

      if (instanceIds == true) {
        break;
      }

      if (instanceIds.length == 0) {
        await delay(DELAY_WHEN_NO_PENDING_EVENTS_MS);
      }

      for (const item of instanceIds) {
        const doUnlock = unlockWkflowInstance(item);
        yield {
          item,
          onError: doUnlock,
          onSuccess: doUnlock,
        };
      }
    }
  });
}

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
      `${instanceId}_transaction`, // TODO should be unique and used on tracing
      { isolation_level: "repeatable_read" }
    );
  };
  return {
    withinTransaction,
    onPendingEvent: (
      handler: (instanceId: string) => Promise<void>,
      options?: HandlerOpts
    ) => {
      startWorkers(
        handler,
        instancesGenerator(options?.cancellation ?? new Event()),
        options?.concurrency
      );
    },
  };
}
