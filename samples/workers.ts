import { Event } from "https://deno.land/x/async@v1.2.0/mod.ts";
import { tryParseInt } from "../utils.ts";
import { Workflow } from "../workflow.ts";
import { workflowService } from "./main.ts";
import * as workflows from "./workflows.ts";

for (const [_, value] of Object.entries(workflows)) {
  workflowService.registerWorkflow(value as Workflow);
}

const WORKER_COUNT = tryParseInt(Deno.env.get("WORKERS_COUNT")) ?? 10;
const cancellation = new Event();
Deno.addSignalListener("SIGINT", () => {
  cancellation.set();
});

await workflowService.startWorkers({ cancellation, concurrency: WORKER_COUNT });
await cancellation.wait();
Deno.exit(0);
