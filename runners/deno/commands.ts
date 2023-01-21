// deno-lint-ignore-file no-explicit-any
import { Activity } from "../../context.ts";
import { isAwaitable, PromiseOrValue } from "../../promise.ts";
import { Arg } from "../../types.ts";
import { ActivityStartedEvent, newEvent } from "../../workers/events.ts";
import { HistoryEvent } from "../../workers/events.ts";
import { WorkflowState } from "./state.ts";

/**
 * A Durable Command.
 */
export interface CommandBase {
  /**
   * the name of the command
   */
  name: string;
  /**
   * isReplaying
   */
  isReplaying?: boolean;
}

export interface NoOpCommand extends CommandBase {
  name: "no_op";
}

/**
 * SleepCommand used to stop execution until reached the specified date.
 */
export interface SleepCommand extends CommandBase {
  name: "sleep";
  until: Date;
}

/**
 * ScheduleActivityCommand is used for scheduling long running tasks.
 */
export interface ScheduleActivityCommand<
  TArgs extends Arg = Arg,
  TResult = unknown,
> extends CommandBase {
  activity: Activity<TArgs, TResult>;
  input: [...TArgs];
  name: "schedule_activity";
}

export interface WaitForSignalCommand extends CommandBase {
  name: "wait_signal";
  signal: string;
}

export interface FinishWorkflowCommand<TResult = unknown> extends CommandBase {
  name: "finish_workflow";
  result: TResult;
}
export type Command =
  | NoOpCommand
  | SleepCommand
  | ScheduleActivityCommand<any, any>
  | WaitForSignalCommand
  | FinishWorkflowCommand<any>;

const no_op = () => [];
const sleep = ({ isReplaying, until }: SleepCommand): HistoryEvent[] => {
  if (isReplaying) {
    return [];
  }
  return [
    {
      ...newEvent(),
      type: "timer_scheduled",
      until,
    },
    {
      ...newEvent(),
      type: "timer_fired",
      timestamp: until,
      visibleAt: until,
    },
  ];
};

const finish_workflow = ({ result }: FinishWorkflowCommand): HistoryEvent[] => [
  {
    ...newEvent(),
    result,
    type: "workflow_finished",
  },
];

const schedule_activity = async <TArgs extends Arg = Arg, TResult = unknown>(
  { activity, input }: ScheduleActivityCommand<TArgs, TResult>,
): Promise<HistoryEvent[]> => {
  const started = new Date();
  const eventBase = {
    activityName: activity.name,
  };

  const startedEvent: ActivityStartedEvent<TArgs> = {
    ...newEvent(),
    ...eventBase,
    timestamp: started,
    activityName: activity.name,
    type: "activity_started",
    input: input,
  };

  try {
    const activityResult = activity(...input);
    const result = isAwaitable(activityResult)
      ? await activityResult
      : activityResult;
    return [
      startedEvent,
      {
        ...newEvent(),
        ...eventBase,
        type: "activity_completed",
        result,
      },
    ];
  } catch (error) {
    return [
      startedEvent,
      {
        ...newEvent(),
        ...eventBase,
        type: "activity_completed",
        exception: error,
      },
    ];
  }
};

const wait_signal = (
  { isReplaying, signal }: WaitForSignalCommand,
): HistoryEvent[] =>
  isReplaying ? [] : [
    {
      ...newEvent(),
      type: "waiting_signal",
      signal,
    },
  ];

const handleByCommand: Record<
  CommandBase["name"],
  (c: any, state: WorkflowState<any, any>) => PromiseOrValue<HistoryEvent[]>
> = {
  no_op,
  sleep,
  finish_workflow,
  schedule_activity,
  wait_signal,
};

export const handleCommand = async <TArgs extends Arg = Arg, TResult = unknown>(
  c: CommandBase,
  state: WorkflowState<TArgs, TResult>,
): Promise<HistoryEvent[]> => {
  const promiseOrValue = handleByCommand[c.name](c, state);
  return isAwaitable(promiseOrValue) ? await promiseOrValue : promiseOrValue;
};
