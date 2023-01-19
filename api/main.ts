import { serve } from "https://deno.land/std@0.173.0/http/server.ts";
import { router } from "https://deno.land/x/rutt@0.0.14/mod.ts";
import { postgres } from "../backends/postgres/db.ts";
import { WorkflowService } from "./service.ts";

const service = new WorkflowService(postgres());
await serve(
  router({
    "PUT@/workflows/:alias": async (req, _, { alias }) => {
      const { type, ...rest } = await req.json();
      await service.registerWorkflowOfType(alias, rest, type);
      return Response.json({ type, alias, ...rest });
    },
    "GET@/workflows": async (_req) => {
      return Response.json({ items: await service.listWorkflows() });
    },
    "GET@/workflows/:alias": async (_req, _, { alias }) => {
      const workflow = await service.getWorkflow(alias);
      if (workflow === undefined) {
        return Response.json({}, { status: 404 });
      }
      return Response.json(workflow);
    },
    "POST@/executions": async (req) => {
      const { alias, input } = await req.json();
      return Response.json(
        await service.startWorkflow(
          { alias },
          Array.isArray(input) ? input : [input],
        ),
      );
    },
    "GET@/executions": (_req) =>
      new Response("NOT IMPLEMENTED", { status: 501 }),
    "GET@/executions/:id": async (_req, _, { id }) => {
      const execution = await service.getExecution(id);
      if (execution === undefined) {
        return Response.json({}, { status: 404 });
      }
      return Response.json(execution);
    },
    "DELETE@/executions/:id": (_req) =>
      new Response("NOT IMPLEMENTED", { status: 501 }),
    "POST@/executions/:id/signals/:signal": async (req, _, { id, signal }) => {
      await service.signalWorkflow(id, signal, await req.json());
      return Response.json(
        { id, signal },
      );
    },
  }),
  { port: 8001 },
);
