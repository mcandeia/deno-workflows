import { isAwaitable } from "../async/promise.ts";
import { HistoryEvent } from "../events/event.ts";
import {
  Activity,
  Arg,
  isValue,
  WorkflowContext,
} from "../workflow/context.ts";
import { runWorkflowWithFn, waitForCompletion } from "../workflow/executor.ts";

export type CommandState = "Running" | "Failed" | "Completed";
/**
 * A Durable Command.
 */
export interface Command {
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

  run(continueWith: (events: HistoryEvent[]) => void): void;
}

/**
 * @hidden
 * Base class for all Command, defines the basic state transitions for all commands.
 */
export abstract class CommandBase implements Command {
  public state: CommandState;
  public result: unknown;

  /**
   * @hidden
   *
   * Construct a command.
   * @param id
   *  The task's ID
   */
  constructor(public id: string) {
    this.state = "Running";
  }

  abstract run(continueWith: (events: HistoryEvent[]) => void): void;

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
        const errMessage = `Command ID ${this.id} failed but it's value was not an Exception`;
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

export class NoOpCommand extends CommandBase {
  run(): HistoryEvent[] {
    return [];
  }
  constructor() {
    super("");
    this.state = "Completed";
    this.result = undefined;
  }
}

export class ScheduleActivityCommand<
  TArgs extends Arg = Arg,
  TResult = unknown
> extends CommandBase {
  constructor(
    protected activity: Activity<TResult, TArgs>,
    protected ctx: WorkflowContext,
    protected input: [...TArgs]
  ) {
    super(activity.name);
  }
  public get name(): string {
    return "schedule_activity";
  }
  public get source(): string {
    return this.activity.name; // TODO improve integrity check
  }

  public run(continueWith: (newEvents: HistoryEvent[]) => void): void {
    const started = new Date();
    const result = this.activity(this.ctx, ...this.input);
    const eventBase = {
      id: this.id,
      activity: this.activity.name,
    };

    const startedEvent: HistoryEvent = {
      ...eventBase,
      timestamp: started,
      type: "execution_started",
      input: this.input,
    };

    if (isAwaitable(result)) {
      result
        .then((resp) => {
          continueWith([
            {
              ...eventBase,
              timestamp: new Date(),
              type: "execution_completed",
              result: resp,
            },
          ]);
        })
        .catch((err) => {
          continueWith([
            {
              ...eventBase,
              timestamp: new Date(),
              type: "execution_completed",
              exception: err,
            },
          ]);
        });
    } else if (isValue(result)) {
      return continueWith([
        startedEvent,
        {
          ...eventBase,
          timestamp: new Date(),
          type: "execution_completed",
          result,
        },
      ]);
    } else {
      const innerId = `${this.ctx.instanceId}${this.ctx.random()}`;
      runWorkflowWithFn(innerId, (_) => result);
      waitForCompletion<TResult>(innerId).then((resp) => {
        const event: HistoryEvent = resp.exception
          ? {
              ...eventBase,
              timestamp: new Date(),
              type: "execution_completed",
              exception: resp.exception,
            }
          : {
              ...eventBase,
              timestamp: new Date(),
              type: "execution_completed",
              result: resp.result,
            };
        continueWith([event]);
      });
    }

    continueWith([startedEvent]);
  }
}
