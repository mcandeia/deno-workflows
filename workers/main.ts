import { delay } from "https://deno.land/std@0.160.0/async/delay.ts";
import { Event, Queue } from "https://deno.land/x/async@v1.2.0/mod.ts";
import { postgres } from "../backends/postgres/db.ts";

import { tryParseInt } from "../utils.ts";
import { DB } from "../backends/backend.ts";
import { executorBuilder, hasCompleted, WorkflowExecutor } from "./executor.ts";
import { startWorkers, WorkItem } from "./worker.ts";

export interface HandlerOpts {
  cancellation?: Event;
  concurrency?: number;
}

const MAX_LOCK_MINUTES = tryParseInt(Deno.env.get("WORKERS_LOCK_MINUTES")) ??
  10;

const DELAY_WHEN_NO_PENDING_EVENTS_MS =
  tryParseInt(Deno.env.get("PG_INTERVAL_EMPTY_EVENTS")) ?? 15_000;

async function* executionsGenerator(
  db: DB,
  freeWorkers: () => number,
  cancellation: Event,
): AsyncGenerator<WorkItem<string>, void, unknown> {
  while (!cancellation.is_set()) {
    const limit = freeWorkers();
    if (limit === 0) {
      await Promise.race([
        delay(DELAY_WHEN_NO_PENDING_EVENTS_MS),
        cancellation.wait(),
      ]);
      continue;
    }
    const executionIds = await Promise.race([
      db.pendingExecutions(MAX_LOCK_MINUTES, limit),
      cancellation.wait(),
    ]);

    if (executionIds == true) {
      break;
    }

    if (executionIds.length == 0) {
      await Promise.race([
        delay(DELAY_WHEN_NO_PENDING_EVENTS_MS),
        cancellation.wait(),
      ]);
      continue;
    }

    for (const { execution: item, unlock } of executionIds) {
      yield {
        item,
        onError: async (err) => {
          await unlock();
          throw err;
        },
        onSuccess: unlock,
      };
    }
  }
}

const workflowHandler =
  (client: DB, registry: WorkflowRegistry) => async (executionId: string) => {
    await client.withinTransaction(async (db) => {
      const executionDB = db.execution(executionId);
      const maybeInstance = await executionDB.get();
      if (maybeInstance === undefined) {
        throw new Error("workflow not found");
      }
      const executor = maybeInstance
        ? await registry.get(maybeInstance.alias)
        : undefined;

      if (executor === undefined) {
        throw new Error("workflow not found");
      }

      const [history, pendingEvents] = await Promise.all([
        executionDB.history.get(),
        executionDB.pending.get(),
      ]);

      const newEventsOrCompleted = await executor(
        executionId,
        history,
        pendingEvents,
      );
      let lastSeq = history.length === 0 ? 0 : history[history.length - 1].seq;

      const opts: Promise<void>[] = [
        executionDB.pending.del(...pendingEvents),
        executionDB.history.add(
          ...pendingEvents.map((event) => ({ ...event, seq: ++lastSeq })),
        ),
      ];
      if (hasCompleted(newEventsOrCompleted)) {
        opts.push(
          executionDB.update({
            ...maybeInstance,
            ...newEventsOrCompleted,
            completedAt: new Date(),
          }),
        );
      } else {
        if (newEventsOrCompleted.length !== 0) {
          opts.push(executionDB.pending.add(...newEventsOrCompleted));
        }
      }
      await Promise.all(opts);
    });
  };

// idea: WorkflowRegistry is saved at files system using a routine
// following the same rationale we can persist the workflows on file system and use a stale-while-revalidate strategy
// to download the new code.
interface WorkflowRegistry {
  get(alias: string): Promise<WorkflowExecutor | undefined>;
}

const buildRegistry = (db: DB): WorkflowRegistry => {
  return {
    // TODO Add HARD Cache here.
    get: async (alias: string) => {
      const executor = await db.executors.get(alias);
      if (executor === undefined) {
        return undefined;
      }
      return await executorBuilder[executor.type](executor);
    },
  };
};

const run = async (
  db: DB,
  { cancellation, concurrency }: HandlerOpts,
) => {
  const workerCount = concurrency ?? 1;
  const q = new Queue<WorkItem<string>>(workerCount);
  await startWorkers(
    workflowHandler(db, buildRegistry(db)),
    executionsGenerator(
      db,
      () => workerCount - q.qsize(),
      cancellation ?? new Event(),
    ),
    workerCount,
    q,
  );
};

const WORKER_COUNT = tryParseInt(Deno.env.get("WORKERS_COUNT")) ?? 10;
const cancellation = new Event();
Deno.addSignalListener("SIGINT", () => {
  cancellation.set();
});

await run(postgres(), { cancellation, concurrency: WORKER_COUNT });
await cancellation.wait();
Deno.exit(0);
