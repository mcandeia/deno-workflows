import { isAwaitable } from "../async/promise.ts";
import { HistoryEvent } from "../events/event.ts";
import {
  Activity,
  Arg,
  isGenerator,
  WorkflowContext,
} from "../workflow/context.ts";
import { runWithGenerator } from "../workflow/executor.ts";

export interface Command {
  name: string;
  source: string;
  completed: boolean;
  run(): HistoryEvent[];
}

export class GenesisCommand implements Command {
  public completed = false;
  public get name(): string {
    return "genesis";
  }
  public get source(): string {
    return "";
  }
  run(): HistoryEvent[] {
    this.completed = true;
    return [
      {
        type: "workflow_started",
        timestamp: new Date(),
        source: this.source,
      },
    ];
  }
}

export class ScheduleActivityCommand<TArgs extends Arg = Arg, TResult = unknown>
  implements Command
{
  public completed = false;
  constructor(
    protected activity: Activity<TResult, TArgs>,
    protected ctx: WorkflowContext,
    protected input: [...TArgs]
  ) {}
  public get name(): string {
    return "schedule_activity";
  }
  public get source(): string {
    return this.activity.name; // TODO improve integrity check
  }

  public run(): HistoryEvent[] {
    const started = new Date();
    const result = this.activity(this.ctx, ...this.input);

    const activityResponse = isGenerator(result)
      ? runWithGenerator<TResult>(
          result,
          `${this.ctx.instanceId}_${this.ctx.random()}`
        )
      : result;

    const finished = new Date();

    const eventBase = {
      source: this.source,
      activity: this.activity.name,
    };

    this.completed = true;
    return [
      {
        ...eventBase,
        timestamp: started,
        type: "execution_started",
        input: this.input,
      },
      isAwaitable(activityResponse)
        ? {
            ...eventBase,
            timestamp: finished,
            type: "execution_pending",
            result: activityResponse,
          }
        : {
            ...eventBase,
            timestamp: finished,
            type: "execution_completed",
            result: activityResponse,
          },
    ];
  }
}
