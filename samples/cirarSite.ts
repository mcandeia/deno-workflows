import { startFrom } from "../client/client.ts";
import { ActivityResult, WorkflowContext } from "../workflow/context.ts";

export interface Props {
  name: string;
}

export interface Context extends WorkflowContext {
  denoKey: string;
}

// [{return: siteId123, type: http, method: GET, url: ..., name: },{ type: sleep, endsAt: 06/12/2022 11:57 }, {type: waitPolling, signalType: "pedido_criado" }];
function* criarSite(ctx: Context, input: Props): ActivityResult<string> {
  const siteId: string = yield ctx.callActivity(
    provisionarDenoDeploy,{},
    input.name
  );

  yield ctx.httpRequest(URL, ...)

  ctx.sleep("1d");

  ctx.random();
  ctx.now();

  return siteId;
}

function provisionarDenoDeploy(
  _: Context,
  name: string
): ActivityResult<string> {
  return name;
}
const wkCtx = startFrom();
const resp = wkCtx.callActivity(criarSite, {
  name: "my-site-name",
});
console.log(resp);
