import { CommandBase, NoOpCommand } from "../commands/command.ts";
import { HistoryEvent } from "../events/event.ts";
import { Arg, WorkflowContext } from "./context.ts";
import { WorkflowState } from "./state.ts";
import { deferred } from "std/async/deferred.ts";
import { Mutex } from "https://deno.land/x/semaphore@v1.1.1/mod.ts";

export const storage: Map<string, HistoryEvent[]> = new Map();
export type WorkflowGenFn<TResp extends unknown = unknown> = Generator<
  CommandBase,
  TResp,
  // deno-lint-ignore no-explicit-any
  any
>;

export type Workflow<TArgs extends Arg = Arg, TResp = unknown> = (
  ctx: WorkflowContext,
  ...args: [...TArgs]
) => WorkflowGenFn<TResp>;

export class WorkflowExecutor<TResp = unknown> {
  protected ctx: WorkflowContext;
  protected current: CommandBase = new NoOpCommand();
  protected result?: TResp;
  protected exception?: Error;
  protected hasFinished = false;
  protected generatorFn: WorkflowGenFn<TResp>;
  private openCommands: Record<string, CommandBase> = {};
  constructor(
    protected instanceId: string,
    protected fn: (ctx: WorkflowContext) => WorkflowGenFn<TResp>
  ) {
    this.ctx = new WorkflowContext(instanceId);
    this.generatorFn = this.fn(this.ctx);
  }

  public run(history?: HistoryEvent[]): WorkflowState<TResp> {
    for (const historyEvent of history ?? []) {
      this.processEvent(historyEvent);
      if (this.hasFinished) {
        break;
      }
    }

    this.execOpenCommands();

    return {
      exception: this.exception,
      result: this.result,
      hasFinished: this.hasFinished,
    };
  }

  private execOpenCommands(): void {
    const continueWith = ((events: HistoryEvent[]) => {
      storage.set(this.instanceId, [
        ...(storage.get(this.instanceId) ?? []),
        ...events,
      ]);
    }).bind(this);

    for (const [_, cmd] of Object.entries(this.openCommands)) {
      cmd.run(continueWith);
    }
  }

  private processEvent(event: HistoryEvent): void {
    switch (event.type) {
      case "execution_started": {
        this.resume();
        break;
      }
      case "execution_completed": {
        const cmd = this.openCommands[event.id];
        if (event.exception) {
          cmd.setValue(true, event.exception);
        } else {
          cmd.setValue(false, event.result);
        }
        delete this.openCommands[event.id];
        this.resume();
        break;
      }
      default: {
        this.resume();
        break;
      }
    }
  }

  public resume() {
    const currentCommand = this.current;
    if (!currentCommand.hasResult) {
      return;
    }

    let newCommand: CommandBase | undefined = undefined;
    try {
      const result = currentCommand.result;
      const genResult = currentCommand.isCompleted
        ? this.generatorFn.next(result)
        : this.generatorFn.throw(result);
      if (genResult.done) {
        this.hasFinished = true;
        this.result = genResult.value;
      } else {
        newCommand = genResult.value;
      }
    } catch (err) {
      this.exception = err;
      this.hasFinished = true;
    }

    if (newCommand !== undefined) {
      this.current = newCommand;
      if (this.current.hasResult) {
        // task already complete so we can resume the code again
        this.resume();
      } else {
        this.openCommands[this.current.id] = this.current;
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
const workflowAwaiters = new Map<string, ((arg0: any) => void)[]>();

export function waitForCompletion<TResp>(
  instanceId: string
): Promise<WorkflowState<TResp>> {
  const promise = deferred<WorkflowState<TResp>>();
  // missing locking mechanism
  workflowAwaiters.set(instanceId, [
    ...(workflowAwaiters.get(instanceId) ?? []),
    promise.resolve,
  ]);
  return promise;
}

const mu = new Mutex();

export async function runWorkflowWithFn<TResp = unknown>(
  instanceId: string,
  fn: (ctx: WorkflowContext) => WorkflowGenFn<TResp>
): Promise<WorkflowState<TResp>> {
  const release = await mu.acquire();
  const executor = new WorkflowExecutor<TResp>(instanceId, fn);
  if (!storage.get(instanceId)) {
    storage.set(instanceId, [
      {
        type: "workflow_started",
        timestamp: new Date(),
        id: "genesis",
      },
    ]);
  }
  const state = executor.run(storage.get(instanceId) ?? []);
  release();
  if (state.hasFinished) {
    for (const notify of workflowAwaiters.get(instanceId) ?? []) {
      // should be done in background
      notify(state);
    }
  }
  return state;
}

export function runWorkflow<TArgs extends Arg = Arg, TResp = unknown>(
  instanceId: string,
  workflow: Workflow<TArgs, TResp>,
  ...args: TArgs
): Promise<WorkflowState<TResp>> {
  return runWorkflowWithFn(
    instanceId,
    (ctx: WorkflowContext): WorkflowGenFn<TResp> => {
      return workflow(ctx, ...args);
    }
  );
}
