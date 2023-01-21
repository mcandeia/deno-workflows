import { Workflow } from "../mod.ts";
import { WorkflowRunner } from "../workers/runner.ts";
import { denoRunner } from "../runners/deno/runner.ts";
import { httpRunnerFor } from "../runners/http/runner.ts";
import { DenoWorkflowRunnerRef, HttpWorkflowRunnerRef } from "./registries.ts";

export const deno = async (
  { url }: DenoWorkflowRunnerRef,
): Promise<WorkflowRunner> => {
  const module = await import(url);
  if (typeof module?.default !== "function") {
    throw new Error(`invalid workflow module: ${module}`);
  }
  return denoRunner(module.default as Workflow);
};

export const http = ({ url }: HttpWorkflowRunnerRef): WorkflowRunner => {
  return httpRunnerFor(url);
};
