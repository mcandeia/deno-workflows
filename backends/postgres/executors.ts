import { WorkflowExecutor } from "../backend.ts";
import { valueOrNull } from "./utils.ts";

const TABLE_EXECUTORS = "executors";

export const listAllExecutors = `SELECT * FROM ${TABLE_EXECUTORS}`;
export const getExecutor = (alias: string): string => {
  return `${listAllExecutors} WHERE alias='${alias}'`;
};

export interface PersistedExecutor {
  alias: string;
  type: string;
  // deno-lint-ignore no-explicit-any
  attributes: any;
}

export const toExecutor = (
  { alias, type, attributes }: PersistedExecutor,
): WorkflowExecutor => {
  return {
    alias,
    type,
    ...attributes,
  };
};

export const insertExecutor = (
  { alias, type, ...rest }: WorkflowExecutor,
): string => {
  return `INSERT INTO ${TABLE_EXECUTORS} (alias, type, attributes) VALUES('${alias}', '${type}', ${
    valueOrNull(
      rest === undefined ? undefined : JSON.stringify(rest),
    )
  })`;
};

export const updateExecutor = (
  { alias, type, ...rest }: WorkflowExecutor,
): string => {
  return `UPDATE ${TABLE_EXECUTORS} SET type='${type}', attributes=${
    valueOrNull(
      rest !== undefined ? JSON.stringify(rest) : undefined,
    )
  } WHERE alias='${alias}'`;
};
