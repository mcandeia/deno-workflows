import { TransactionOptions } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import {
  QueryArrayResult,
  QueryObjectResult,
} from "https://deno.land/x/postgres@v0.17.0/query/query.ts";
import { usePool } from "./connect.ts";

export interface PostgreQueryExecutor {
  queryObject: <T>(q: string) => Promise<QueryObjectResult<T>>;
  queryArray: <T extends unknown[] = unknown[]>(
    q: string
  ) => Promise<QueryArrayResult<T>>;
}

export async function dbTransaction<T>(
  transactionF: (executor: PostgreQueryExecutor) => Promise<T>,
  name: string,
  options?: TransactionOptions
) {
  return await usePool<T>(async (client) => {
    const transaction = client.createTransaction(name, options);
    await transaction.begin();
    try {
      const result = await transactionF({
        queryObject: <T>(q: string): Promise<QueryObjectResult<T>> =>
          transaction.queryObject<T>(q),
        queryArray: <T extends unknown[] = unknown[]>(q: string) =>
          transaction.queryArray<T>(q),
      });
      await transaction.commit();
      return result;
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  });
}
