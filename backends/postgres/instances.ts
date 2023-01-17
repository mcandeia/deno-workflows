import { WorkflowInstance } from "../backend.ts";
import { valueOrNull } from "./utils.ts";

const TABLE_INSTANCES = "instances";
export const insertInstance = (
  instanceId: string,
  { alias, completedAt, result }: WorkflowInstance
): string => {
  return `INSERT INTO ${TABLE_INSTANCES} (id, alias, completed_at, result) VALUES('${instanceId}', '${alias}', ${valueOrNull(
    completedAt?.toISOString()
  )}, ${valueOrNull(result ? JSON.stringify(result) : undefined)})`;
};

export const updateInstance = (
  instanceId: string,
  { alias, completedAt, result }: WorkflowInstance
): string => {
  return `UPDATE ${TABLE_INSTANCES} SET alias='${alias}', completed_at=${valueOrNull(
    completedAt?.toISOString()
  )}, result=${valueOrNull(
    result ? JSON.stringify(result) : undefined
  )} WHERE id='${instanceId}'`;
};

export const getInstance = (instanceId: string): string => {
  return `SELECT id, alias, completed_at completedAt, result FROM ${TABLE_INSTANCES} WHERE id='${instanceId}'`;
};

export const unlockInstance = (instanceId: string): string => {
  return `UPDATE instances SET locked_until = NULL WHERE id='${instanceId}'`;
};

export const pendingInstances = (lockInMinutes: number, limit: number) => `
UPDATE instances
SET locked_until = now()::timestamp + interval '${lockInMinutes} minutes'
WHERE ctid IN (
  SELECT ctid FROM instances i
    WHERE
      (locked_until IS NULL OR locked_until < now())
      AND completed_at IS NULL
      AND EXISTS (
        SELECT 1
          FROM pending_events
          WHERE instance_id = i.id AND (visible_at IS NULL OR visible_at <= now())
      )
    LIMIT ${limit}
) RETURNING id
`;
