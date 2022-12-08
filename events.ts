import { WorkflowState } from "./state.ts";
import { Arg } from "./types.ts";
import { isNoArgFn } from "./workflow.ts";

/**
 * Event is the base event
 */
export interface Event {
  type: string;
  id: string;
  timestamp: Date;
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
  exception?: unknown;
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
  innerWorkflowInstance?: string;
}

/**
 * Raised when an activity is in completed state.
 */
export interface ActivityFinishedEvent<TResult = unknown> extends Event {
  result?: TResult;
  exception?: unknown;
  activityName: string;
  type: "activity_completed";
}

/**
 * All possible types of events.
 */
export type HistoryEvent =
  | WorkflowStartedEvent
  | WorkflowFinishedEvent
  | WorkflowCancelledEvent
  | ActivityStartedEvent
  | ActivityFinishedEvent;

type EventHandler<TEvent extends HistoryEvent = HistoryEvent> = (
  state: WorkflowState,
  event: TEvent
) => WorkflowState;

export const no_op = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: HistoryEvent
): WorkflowState<TArgs, TResult> {
  return state;
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
  { exception, result }: ActivityFinishedEvent<TResult>
): WorkflowState<TArgs, TResult> {
  try {
    const genResult = result
      ? state.generatorFn!.next(result)
      : state.generatorFn!.throw(exception);
    const stateUpdate: Partial<WorkflowState<TArgs, TResult>> = genResult.done
      ? {
          hasFinished: true,
          result: genResult.value,
          current: { ...state.current, isCompleted: true },
        }
      : {
          current: genResult.value,
        };
    return { ...state, ...stateUpdate };
  } catch (err) {
    return { ...state, exception: err, hasFinished: true };
  }
};

const activity_started = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  _: ActivityStartedEvent<TArgs>
): WorkflowState<TArgs, TResult> {
  return { ...state, current: { ...state.current, isReplaying: true } };
};

const workflow_finished = function <TArgs extends Arg = Arg, TResult = unknown>(
  state: WorkflowState<TArgs, TResult>,
  { result, exception, timestamp: finishedAt }: WorkflowFinishedEvent<TResult>
): WorkflowState<TArgs, TResult> {
  if (result === undefined) {
    return { ...state, hasFinished: true, finishedAt, exception };
  }
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
  const baseState = { ...state, startedAt: timestamp, generatorFn };
  if (next.done) {
    return { ...baseState, hasFinished: true, result: next.value };
  }
  return {
    ...state,
    startedAt: timestamp,
    generatorFn,
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
