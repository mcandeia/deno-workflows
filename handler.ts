// deno-lint-ignore-file no-explicit-any
import { Handler } from "https://deno.land/std@0.173.0/http/server.ts";
import { router, Routes } from "https://deno.land/x/rutt@0.0.14/mod.ts";
import { Arg } from "./types.ts";
import { HistoryEvent } from "./workers/events.ts";
import { denoExecutor } from "./executors/deno/executor.ts";
import { Workflow } from "./executors/deno/workflow.ts";

export interface RunRequest {
  executionId: string;
  history: HistoryEvent[];
  pendingEvents: HistoryEvent[];
}

/**
 * Exposes a workflow function as a http handler.
 * @param workflow the workflow function
 * @returns a http handler
 */
export const workflowHTTPHandler = <TArgs extends Arg = Arg, TResult = unknown>(
  workflow: Workflow<TArgs, TResult>,
): Handler => {
  const executor = denoExecutor(workflow);
  return async function (req) {
    const { executionId, history, pendingEvents } = await req
      .json() as RunRequest;

    const resp = await executor(executionId, history, pendingEvents);
    return Response.json(resp);
  };
};

export interface CreateRouteOptions {
  durableServerAddr: string;
  executorAddr: string;
  baseRoute: string;
}

export interface AliasedWorkflow {
  alias: string;
  func: Workflow<any, any>;
}

const removeSlashAtEnd = (url: string): string => {
  if (url.length == 0) {
    return url;
  }
  return url.endsWith("/") ? url.slice(0, url.length - 1) : url;
};
const isAlisedWorkflow = (
  wkflow: AliasedWorkflow | Workflow<any, any>,
): wkflow is AliasedWorkflow => {
  return (wkflow as AliasedWorkflow).alias !== undefined;
};
export type Workflows = Array<Workflow<any, any> | AliasedWorkflow>;

export const useWorkflowRoutes = async (
  { durableServerAddr, executorAddr, baseRoute }: CreateRouteOptions,
  workflows: Workflows,
): Promise<Handler> => {
  const promises: Promise<void>[] = [];
  let routes: Routes = {};
  for (const wkflow of workflows) {
    const { alias, func } = isAlisedWorkflow(wkflow)
      ? wkflow
      : { alias: wkflow.name, func: wkflow };
    const route = `${baseRoute}${alias}`;
    routes = {
      ...routes,
      [`POST@${route}`]: workflowHTTPHandler(func),
    };

    promises.push(
      fetch(`${durableServerAddr}workflows/${alias}`, {
        method: "PUT",
        body: JSON.stringify({
          type: "http",
          url: `${removeSlashAtEnd(executorAddr)}${route}`,
        }),
      }).then(async (resp) => {
        if (resp.status >= 400) {
          throw new Error(
            `error when trying to save workflow routes ${resp.status}: ${
              JSON.stringify(await resp.json())
            }`,
          );
        }
      }),
    );
  }

  await Promise.all(promises);
  return router(routes);
};
