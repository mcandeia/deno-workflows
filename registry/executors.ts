import { Workflow } from "../mod.ts";
import { WorkflowExecutor } from "../workers/executor.ts";
import { denoExecutor } from "../executors/deno/executor.ts";
import { httpExecutorFor } from "../executors/http/executor.ts";
import {
  DenoWorkflowExecutorRef,
  HttpWorkflowExecutorRef,
} from "./registries.ts";

export const deno = async (
  { url }: DenoWorkflowExecutorRef,
): Promise<WorkflowExecutor> => {
  const module = await import(url);
  if (typeof module?.default !== "function") {
    throw new Error(`invalid workflow module: ${module}`);
  }
  return denoExecutor(module.default as Workflow);
};

export const http = ({ url }: HttpWorkflowExecutorRef): WorkflowExecutor => {
  return httpExecutorFor(url);
};
