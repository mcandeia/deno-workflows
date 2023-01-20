import { serve } from "https://deno.land/std@0.173.0/http/server.ts";
import { router } from "https://deno.land/x/rutt@0.0.14/mod.ts";
import { useWorkflowRoutes } from "../mod.ts";
import createOrder from "./createOrder.ts";

await serve(
  router({
    "*": await useWorkflowRoutes({
      durableServerAddr: "http://localhost:8001/",
      executorAddr: "http://localhost:8002/",
      baseRoute: "/",
    }, [createOrder]),
  }),
  { port: 8002 },
);
