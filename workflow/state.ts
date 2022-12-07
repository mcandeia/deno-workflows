import { Command, GenesisCommand } from "../commands/command.ts";
import { cryptoRandomString } from "https://deno.land/x/crypto_random_string@1.0.0/mod.ts";

export interface WorkflowState<TReturn = unknown> {
  startedAt: Date;
  finishedAt?: Date;
  instanceId: string;
  current: Command;
  result?: TReturn;
  generatorFn: Generator<Command, TReturn>;
}

export function newState<TReturn = unknown>(
  fn: Generator<Command, TReturn>
): WorkflowState<TReturn> {
  const instanceId = cryptoRandomString({ length: 10, type: "url-safe" });
  return {
    startedAt: new Date(),
    instanceId: instanceId,
    current: new GenesisCommand(),
    generatorFn: fn,
  };
}
