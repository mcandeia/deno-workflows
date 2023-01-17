import {
  PoolClient,
  Transaction,
} from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { QueryObjectResult } from "https://deno.land/x/postgres@v0.17.0/query/query.ts";
import { HistoryEvent } from "../../events.ts";
import { apply } from "../../utils.ts";
import { WorkflowInstance } from "../backend.ts";
import { DB, Events, Instance, PendingExecution } from "../backend.ts";
import { usePool } from "./connect.ts";
import {
  deleteEvents,
  insertEvents,
  PersistedEvent,
  queryEvents,
  toHistoryEvent,
} from "./events.ts";
import {
  getInstance,
  insertInstance,
  pendingInstances,
  unlockInstance,
  updateInstance,
} from "./instances.ts";
import schema from "./schema.ts";

type UseClient = <TResult>(
  f: (client: Transaction | PoolClient) => Promise<TResult>
) => Promise<TResult>;

const isClient = (client: Transaction | PoolClient): client is PoolClient => {
  return typeof (client as PoolClient).createTransaction !== "function";
};

const unlockWkflowInstance = (instanceId: string) => async () => {
  await usePool((client) => {
    client.queryObject(unlockInstance(instanceId));
  });
};

const queryObject =
  <T>(query: string) =>
  (client: Transaction | PoolClient): Promise<QueryObjectResult<T>> => {
    return client.queryObject<T>(query);
  };

const eventsFor = (
  useClient: UseClient,
  instanceId: string,
  table: string
): Events => {
  const insert = insertEvents(table);
  const del = deleteEvents(table);
  return {
    add: async (...events: [...HistoryEvent[]]) => {
      await useClient(queryObject(insert(instanceId, events)));
    },
    del: async (...events: [...HistoryEvent[]]) => {
      await useClient(queryObject(del(instanceId, events)));
    },
    get: async (visibleAt?: boolean) => {
      const events = await useClient(
        queryObject<PersistedEvent>(queryEvents(table, visibleAt)(instanceId))
      );
      return events.rows.map(toHistoryEvent);
    },
  };
};

const instancesFor =
  (useClient: UseClient) =>
  (instanceId: string): Instance => {
    return {
      pending: eventsFor(useClient, instanceId, "pending_events"),
      history: eventsFor(useClient, instanceId, "history"),
      get: () =>
        useClient(queryObject<WorkflowInstance>(getInstance(instanceId))).then(
          ({ rows }) => (rows.length === 0 ? undefined : rows[0])
        ),
      create: async (instance: WorkflowInstance) => {
        await useClient(queryObject(insertInstance(instanceId, instance)));
      },
      update: async (instance: WorkflowInstance) => {
        await useClient(queryObject(updateInstance(instanceId, instance)));
      },
    };
  };

function dbFor(useClient: UseClient): DB {
  return {
    instance: instancesFor(useClient),
    withinTransaction: async <TResult>(
      exec: (executor: DB) => Promise<TResult>
    ): Promise<TResult> => {
      return await useClient(async (client) => {
        if (!isClient(client)) {
          return await exec(dbFor(apply(client)));
        }
        const transaction = client.createTransaction("transaction", {
          isolation_level: "repeatable_read",
        });
        await transaction.begin();
        try {
          const result = await exec(dbFor(apply(transaction)));
          await transaction.commit();
          return result;
        } catch (e) {
          await transaction.rollback();
          throw e;
        }
      });
    },
    pendingExecutions: async (
      lockTimeoutM: number
    ): Promise<PendingExecution[]> => {
      return await useClient<PendingExecution[]>(async (client) => {
        return await client
          .queryObject<{ id: string }>(pendingInstances(lockTimeoutM))
          .then((r) =>
            r.rows.map(({ id: instance }) => ({
              instance,
              unlock: unlockWkflowInstance(instance),
            }))
          );
      });
    },
  };
}

await usePool((client) => {
  return client.queryObject(schema);
}); // creating db schema.

export const postgres = () => dbFor(usePool);
