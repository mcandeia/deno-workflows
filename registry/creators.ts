// deno-lint-ignore-file no-explicit-any
import { denoExecutor } from "../executors/deno/executor.ts";
import { httpExecutorFor } from "../executors/http/executor.ts";
import { Workflow } from "../mod.ts";
import { PromiseOrValue } from "../promise.ts";
import { WorkflowExecutor } from "../workers/executor.ts";
import {
  DenoWorkflowExecutorRef,
  HttpWorkflowExecutorRef,
  WorkflowExecutorRef,
} from "./registries.ts";

const deno = async (
  { url }: DenoWorkflowExecutorRef,
): Promise<WorkflowExecutor> => {
  const module = await import(url);
  if (typeof module?.default !== "function") {
    throw new Error(`invalid workflow module: ${module}`);
  }
  return denoExecutor(module.default as Workflow);
};

const http = ({ url }: HttpWorkflowExecutorRef): WorkflowExecutor => {
  return httpExecutorFor(url);
};

type ExecutorCreator<T extends WorkflowExecutor> = (
  e: T,
) => PromiseOrValue<WorkflowExecutor>;

export const executorBuilder: Record<
  WorkflowExecutorRef["type"],
  ExecutorCreator<any>
> = {
  deno,
  http,
};
