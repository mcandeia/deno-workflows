// deno-lint-ignore-file no-explicit-any
import { denoRunner } from "../runners/deno/runner.ts";
import { httpRunnerFor } from "../runners/http/runner.ts";
import { Workflow } from "../mod.ts";
import { PromiseOrValue } from "../promise.ts";
import { WorkflowRunner } from "../workers/runner.ts";
import {
  DenoWorkflowRunnerRef,
  HttpWorkflowRunnerRef,
  WorkflowRunnerRef,
} from "./registries.ts";

const deno = async (
  { url }: DenoWorkflowRunnerRef,
): Promise<WorkflowRunner> => {
  const module = await import(url);
  if (typeof module?.default !== "function") {
    throw new Error(`invalid workflow module: ${module}`);
  }
  return denoRunner(module.default as Workflow);
};

const http = ({ url }: HttpWorkflowRunnerRef): WorkflowRunner => {
  return httpRunnerFor(url);
};

type RunnerFactory<T extends WorkflowRunner> = (
  e: T,
) => PromiseOrValue<WorkflowRunner>;

export const runnerBuilder: Record<
  WorkflowRunnerRef["type"],
  RunnerFactory<any>
> = {
  deno,
  http,
};
