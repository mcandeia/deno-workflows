import { WorkflowExecution } from "../backend.ts";
import { valueOrNull } from "./utils.ts";

const TABLE_EXECUTIONS = "executions";
export const insertExecution = (
  executionId: string,
  { alias, completedAt, result }: WorkflowExecution
): string => {
  return `INSERT INTO ${TABLE_EXECUTIONS} (id, alias, completed_at, result) VALUES('${executionId}', '${alias}', ${valueOrNull(
    completedAt?.toISOString()
  )}, ${valueOrNull(result ? JSON.stringify(result) : undefined)})`;
};

export const updateExecution = (
  executionId: string,
  { alias, completedAt, result }: WorkflowExecution
): string => {
  return `UPDATE ${TABLE_EXECUTIONS} SET alias='${alias}', completed_at=${valueOrNull(
    completedAt?.toISOString()
  )}, result=${valueOrNull(
    result !== undefined ? JSON.stringify(result) : undefined
  )} WHERE id='${executionId}'`;
};

export const getExecution = (executionId: string): string => {
  return `SELECT id, alias, completed_at completedAt, result FROM ${TABLE_EXECUTIONS} WHERE id='${executionId}'`;
};

export const unlockExecution = (executionId: string): string => {
  return `UPDATE ${TABLE_EXECUTIONS} SET locked_until = NULL WHERE id='${executionId}'`;
};

export const pendingExecutions = (lockInMinutes: number, limit: number) => `
UPDATE ${TABLE_EXECUTIONS}
SET locked_until = now()::timestamp + interval '${lockInMinutes} minutes'
WHERE ctid IN (
  SELECT ctid FROM ${TABLE_EXECUTIONS} i
    WHERE
      (locked_until IS NULL OR locked_until < now())
      AND completed_at IS NULL
      AND EXISTS (
        SELECT 1
          FROM pending_events
          WHERE execution_id = i.id AND (visible_at IS NULL OR visible_at <= now())
      )
    LIMIT ${limit}
) RETURNING id
`;
