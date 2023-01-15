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
