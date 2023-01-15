import { Pool, PoolClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const poolSize = 4;
const pool = new Pool({}, poolSize, true);

export async function usePool<T>(
  f: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await f(client);
  } finally {
    client.release();
  }
}
