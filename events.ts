import { Command, FinishWorkflowCommand } from "./commands.ts";
import { WorkflowState } from "./state.ts";
import { Arg } from "./types.ts";
import { isNoArgFn } from "./workflow.ts";
import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";

/**
 * Event is the base event
 */
export interface Event {
  type: string;
  id: string;
  timestamp: Date;
  visibleAt?: Date;
}

/**
 * WorkflowStartedEvent is the event that should start the workflow
 */
export interface WorkflowStartedEvent<TArgs extends Arg = Arg> extends Event {
  type: "workflow_started";
  input?: TArgs;
}

/**
 * WorkflowStartedEvent is the event that should start the workflow
 */
export interface WorkflowFinishedEvent<TResult = unknown> extends Event {
  type: "workflow_finished";
  result?: TResult;
}

/**
 * WorkflowCancelledEvent is a event that will cancel the workflow
 */
export interface WorkflowCancelledEvent extends Event {
  type: "workflow_cancelled";
  reason?: string;
}

/**
 * ActivityStartedEvent is the event that is raised when the activity starts.
 */
export interface ActivityStartedEvent<TArgs extends Arg = Arg> extends Event {
  input?: TArgs;
  type: "activity_started";
  activityName: string;
}

/**
 * TimerScheduledEvent is the event that is raised when a timer is scheduled.
 */
export interface TimerScheduledEvent extends Event {
  type: "timer_scheduled";
  until: Date;
}

/**
 * TimerFiredEvent is the event that is raised when a timer is fired.
 */
export interface TimerFiredEvent extends Event {
  type: "timer_fired";
}

/**
 * Raised when an activity is in completed state.
 */
export interface ActivityCompletedEvent<TResult = unknown> extends Event {
  result?: TResult;
  exception?: unknown;
  activityName: string;
  type: "activity_completed";
}

/**
 * WaitingSignalEvent is used to indicate that the state is waiting for signal to proceed.
 */
export interface WaitingSignalEvent extends Event {
  signal: string;
  type: "waiting_signal";
}

export interface SignalReceivedEvent extends Event {
  type: "signal_received";
  signal: string;
  payload?: unknown;
}
/**
 * All possible types of events.
 */
export type HistoryEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | WorkflowCancelledEvent
  | ActivityStartedEvent
  | ActivityCompletedEvent
  | TimerScheduledEvent
  | TimerFiredEvent
  | WaitingSignalEvent
  | SignalReceivedEvent;

type EventHandler<TEvent extends HistoryEvent = HistoryEvent> = (
  state: WorkflowState,
  event: TEvent
) => WorkflowState;

const next = <TResult>({
  done,
  value,
}: IteratorResult<Command, TResult>): Command => {
  return done ? new FinishWorkflowCommand<TResult>(value) : value;
};

export const no_op = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: HistoryEvent
): WorkflowState<TArgs, TResult> {
  return state;
};

export const waiting_signal = function <
  TArgs extends Arg = Arg,
  TResult = unknown
>(
  state: WorkflowState<TArgs, TResult>,
  { signal }: WaitingSignalEvent
): WorkflowState<TArgs, TResult> {
  state.current.isReplaying = true;
  return {
    ...state,
    signals: { [signal]: state.generatorFn! },
  };
};

export const signal_received = function <
  TArgs extends Arg = Arg,
  TResult = unknown
>(
  state: WorkflowState<TArgs, TResult>,
  { signal, payload }: SignalReceivedEvent
): WorkflowState<TArgs, TResult> {
  const signalFn = state.signals[signal];
  if (signalFn === undefined) {
    return state;
  }
  return {
    ...state,
    signals: { [signal]: undefined },
    current: next(signalFn.next(payload)),
  };
};

const timer_scheduled = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: HistoryEvent
): WorkflowState<TArgs, TResult> {
  state.current.isReplaying = true;
  return state;
};

const timer_fired = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: HistoryEvent
): WorkflowState<TArgs, TResult> {
  return { ...state, current: next(state.generatorFn!.next()) };
};

const workflow_cancelled = function <
  TArgs extends Arg = Arg,
  TResult = unknown
>(
  state: WorkflowState<TArgs, TResult>,
  { timestamp: cancelledAt }: WorkflowCancelledEvent
): WorkflowState<TArgs, TResult> {
  return { ...state, cancelledAt };
};

const activity_completed = function <
  TArgs extends Arg = Arg,
  TResult = unknown
>(
  state: WorkflowState<TArgs, TResult>,
  { exception, result }: ActivityCompletedEvent<TResult>
): WorkflowState<TArgs, TResult> {
  try {
    const genResult = exception
      ? state.generatorFn!.throw(exception)
      : state.generatorFn!.next(result);
    return { ...state, current: next(genResult) };
  } catch (err) {
    return { ...state, exception: err, hasFinished: true };
  }
};

const activity_started = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: ActivityStartedEvent<TArgs>
): WorkflowState<TArgs, TResult> {
  state.current.isReplaying = true; // TODO check if this event comes from current command by comparing ids.
  return state;
};

const workflow_finished = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  { result, timestamp: finishedAt }: WorkflowFinishedEvent<TResult>
): WorkflowState<TArgs, TResult> {
  return { ...state, hasFinished: true, finishedAt, result };
};

const workflow_started = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  { input, timestamp }: WorkflowStartedEvent<TArgs>
): WorkflowState<TArgs, TResult> {
  const workflowFn = state.workflowFn;
  const generatorFn = input
    ? workflowFn(...input)
    : isNoArgFn(workflowFn)
    ? workflowFn()
    : undefined;

  if (generatorFn === undefined) {
    throw new Error("input not provided for genfn func");
  }
  const next = generatorFn.next();
  const baseState = {
    ...state,
    startedAt: timestamp,
    generatorFn,
  };
  if (next.done) {
    return { ...baseState, hasFinished: true, result: next.value };
  }
  return {
    ...baseState,
    current: next.value,
  };
};

// deno-lint-ignore no-explicit-any
const handlers: Record<HistoryEvent["type"], EventHandler<any>> = {
  workflow_cancelled,
  activity_completed,
  activity_started,
  workflow_finished,
  workflow_started,
  timer_scheduled,
  timer_fired,
  waiting_signal,
  signal_received,
};

export function apply<TArgs extends Arg = Arg, TResult = unknown>(
  workflowState: WorkflowState<TArgs, TResult>,
  event: HistoryEvent
): WorkflowState<TArgs, TResult> {
  return handlers[event.type](
    workflowState as WorkflowState,
    event
  ) as WorkflowState<TArgs, TResult>;
}

export const newEvent = (): Omit<Event, "type"> => {
  return {
    id: v4.generate(),
    timestamp: new Date(),
  };
};
