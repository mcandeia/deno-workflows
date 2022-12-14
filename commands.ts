import { Backend } from "./backend.ts";
import { Activity, WorkflowContext } from "./context.ts";
import { ActivityStartedEvent, HistoryEvent } from "./events.ts";
import { isAwaitable, PromiseOrValue } from "./promise.ts";
import { Arg } from "./types.ts";
import { randomFloat } from "https://raw.githubusercontent.com/alextes/vegas/main/mod.ts";

/**
 * The possible command state
 */
export type CommandState = "Running" | "Failed" | "Completed";

/**
 * A Durable Command.
 */
export interface Command {
  /**
   * the name of the command
   */
  name: string;
  /**
   * Whether the task has completed. Note that completion is not
   * equivalent to success.
   */
  isCompleted: boolean;
  /**
   * Whether the task faulted in some way due to error.
   */
  isFaulted: boolean;
  /**
   * The result of the task, if completed. Otherwise `undefined`.
   */
  result?: unknown;
  /**
   * isReplaying
   */
  isReplaying: boolean;
  /**
   * Executes the underlying command and returns a list of raised events.
   */
  run(be: Backend): PromiseOrValue<HistoryEvent[]>;
}

/**
 * @hidden
 * Base class for all Command, defines the basic state transitions for all commands.
 */
export abstract class CommandBase implements Command {
  public state: CommandState;
  public result: unknown;
  public isReplaying = false;

  /**
   * @hidden
   *
   * Construct a command.
   * @param id
   *  The task's ID
   */
  constructor() {
    this.state = "Running";
  }

  abstract run(be: Backend): PromiseOrValue<HistoryEvent[]>;

  abstract get name(): string;

  /** Whether this task is not in the Running state */
  get hasResult(): boolean {
    return this.state !== "Running";
  }

  get isFaulted(): boolean {
    return this.state === "Failed";
  }

  get isCompleted(): boolean {
    return this.state === "Completed";
  }

  /** Change this task from the Running state to a completed state */
  private changeState(state: CommandState): void {
    if (state === "Running") {
      throw Error("Cannot change Command to the RUNNING state.");
    }
    this.state = state;
  }

  /** Attempt to set a result for this task, and notifies parents, if any */
  public setValue(isError: boolean, value: unknown): void {
    let newState: CommandState;

    if (isError) {
      if (!(value instanceof Error)) {
        const errMessage = `Command failed but it's value was not an Exception`;
        throw new Error(errMessage);
      }
      newState = "Failed";
    } else {
      newState = "Completed";
    }

    this.changeState(newState);
    this.result = value;
  }
}

/**
 * NoOpCommand should starts all workflows.
 */
export class NoOpCommand extends CommandBase {
  get name(): string {
    return "no_op";
  }
  run(_: Backend): HistoryEvent[] {
    return [];
  }
  constructor() {
    super();
    this.state = "Completed";
    this.result = undefined;
  }
}

/**
 * ScheduleActivityCommand is used for scheduling long running tasks.
 */
export class ScheduleActivityCommand<
  TArgs extends Arg = Arg,
  TResult = unknown
> extends CommandBase {
  constructor(
    protected activity: Activity<TArgs, TResult>,
    protected ctx: WorkflowContext,
    protected input: [...TArgs]
  ) {
    super();
  }

  public get name(): string {
    return "schedule_activity";
  }
  public async run(_: Backend): Promise<HistoryEvent[]> {
    const started = new Date();
    const eventBase = {
      activityName: this.activity.name,
    };

    const startedEvent: ActivityStartedEvent<TArgs> = {
      ...eventBase,
      id: `${this.ctx.random()}`,
      timestamp: started,
      activityName: this.activity.name,
      type: "activity_started",
      input: this.input,
    };

    try {
      const activityResult = this.activity(this.ctx, ...this.input);
      const result = isAwaitable(activityResult)
        ? await activityResult
        : activityResult;
      return [
        startedEvent,
        {
          ...eventBase,
          id: `${this.ctx.random()}`,
          timestamp: new Date(),
          type: "activity_completed",
          result,
        },
      ];
    } catch (error) {
      return [
        startedEvent,
        {
          ...eventBase,
          id: `${this.ctx.random()}`,
          timestamp: new Date(),
          type: "activity_completed",
          exception: error,
        },
      ];
    }
  }
}

export class FinishWorkflowCommand<TResult = unknown> extends CommandBase {
  constructor(private resp: TResult) {
    super();
  }
  run(_: Backend): PromiseOrValue<HistoryEvent[]> {
    return [
      {
        result: this.resp,
        timestamp: new Date(),
        id: `${randomFloat()}`,
        type: "workflow_finished",
      },
    ];
  }
  get name(): string {
    throw "finish_workflow";
  }
}

// todo can be used later.
export class StartWorkflowCommand<TArgs extends Arg = Arg> extends CommandBase {
  constructor(private args: TArgs) {
    super();
  }
  run(_: Backend): PromiseOrValue<HistoryEvent[]> {
    return [
      {
        input: this.args,
        timestamp: new Date(),
        id: `${randomFloat()}`,
        type: "workflow_started",
      },
    ];
  }
  get name(): string {
    throw "start_workflow";
  }
}
