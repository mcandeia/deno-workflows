import { DB } from "https://deno.land/x/sqlite@v3.7.0/mod.ts";
import { HistoryEvent } from "../../events.ts";
import { PromiseOrValue } from "../../promise.ts";
import { Backend, TransactionExecutor } from "../backend.ts";

const dbSchema = await Deno.readTextFile("./schema.sql");

const db = new DB("test.db");
db.execute(dbSchema);

const transactionAsync = async <T>(f: () => Promise<T>): Promise<T> => {
  db.query(`SAVEPOINT _deno_sqlite_sp`);
  let value;
  try {
    value = await f();
  } catch (err) {
    db.query(`ROLLBACK TO _deno_sqlite_sp`);
    throw err;
  }
  db.query(`RELEASE _deno_sqlite_sp`);
  return value;
};

export function sqlite(): Backend {
  const withinTransaction = async function <T>(
    _instanceId: string,
    withLock: (
      events: HistoryEvent[],
      pendingEvents: HistoryEvent[],
      executor: TransactionExecutor
    ) => PromiseOrValue<T>
  ): Promise<T> {
    return await transactionAsync(async () => {
      return await withLock([], [], {
        add: (_) => {},
        addPending: (_) => {},
      });
    });
  };
  return { withinTransaction };
}
