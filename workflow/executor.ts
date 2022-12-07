import { Command } from "../commands/command.ts";
import { apply, HistoryEvent } from "../events/event.ts";
import { WorkflowContext } from "./context.ts";
import { newState } from "./state.ts";

export const storage: Map<string, HistoryEvent[]> = new Map();

export function runWithGenerator<TResp>(
  // deno-lint-ignore no-explicit-any
  gen: Generator<Command, TResp, any>,
  instanceId: string
): TResp {
  const events = storage.get(instanceId) ?? [];
  let currentState = events.reduce(apply, newState<TResp>(gen));

  while (!currentState.result) {
    // workflow has not finished yet
    const newEvents = currentState.current.run();
    currentState = newEvents.reduce(apply, currentState);
    storage.set(instanceId, [...(storage.get(instanceId) ?? []), ...newEvents]);
  }

  return currentState.result;
}

export function runWorkflow<TResp>(
  // deno-lint-ignore no-explicit-any
  fn: (context: WorkflowContext) => Generator<Command, TResp, any>,
  instanceId: string
): TResp {
  return runWithGenerator(fn(new WorkflowContext(instanceId)), instanceId);
}
