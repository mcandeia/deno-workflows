// deno-lint-ignore-file no-explicit-any
import { PromiseOrValue } from "../promise.ts";
import {
  DenoWorkflowExecutor,
  HttpWorkflowExecutor,
  WorkflowExecutor as PersistedWorkflowExecutor,
} from "../backends/backend.ts";
import { HistoryEvent } from "./events.ts";
import { denoExecutor } from "./executors/deno/executor.ts";
import { Workflow } from "./executors/deno/workflow.ts";
import { httpExecutorFor } from "./executors/http/executor.ts";

export interface Completed {
  result: unknown;
}
/**
 * Any function that receives the history and returns new pending events is considered a workflow executor.
 */
export type WorkflowExecutor = (
  executionId: string,
  history: HistoryEvent[],
  pending: HistoryEvent[],
) => Promise<HistoryEvent[] | Completed>;

export const hasCompleted = (
  events: HistoryEvent[] | Completed,
): events is Completed => {
  return (events as Completed).result !== undefined;
};

const deno = async (
  { url }: DenoWorkflowExecutor,
): Promise<WorkflowExecutor> => {
  const module = await import(url);
  if (typeof module?.default !== "function") {
    throw new Error(`invalid workflow module: ${module}`);
  }
  return denoExecutor(module.default as Workflow);
};

const http = ({ url }: HttpWorkflowExecutor): WorkflowExecutor => {
  return httpExecutorFor(url);
};

type ExecutorCreator<T extends WorkflowExecutor> = (
  e: T,
) => PromiseOrValue<WorkflowExecutor>;

export const executorBuilder: Record<
  PersistedWorkflowExecutor["type"],
  ExecutorCreator<any>
> = {
  deno,
  http,
};
