import { WorkflowState } from "../workflow/state.ts";

export interface Event {
  source: string;
  timestamp: Date;
}

export interface WorkflowExecutionStartedEvent extends Event {
  type: "workflow_started";
}

export interface WorkflowExecutionFinishedEvent extends Event {
  type: "workflow_finished";
}

export interface ActivityExecutionStartedEvent<
  TArgs extends unknown[] = unknown[]
> extends Event {
  type: "execution_started";
  activity: string;
  input?: TArgs;
}

export interface ActivityExecutionCompletedEvent<TResult = unknown>
  extends Event {
  type: "execution_completed";
  activity: string;
  result?: TResult;
  exception?: Error;
}

export interface ActivityExecutionPendingEvent<TResult = unknown>
  extends Event {
  type: "execution_pending";
  activity: string;
  result: Promise<TResult>;
}

export type HistoryEvent =
  | ActivityExecutionStartedEvent
  | ActivityExecutionCompletedEvent
  | WorkflowExecutionFinishedEvent
  | WorkflowExecutionStartedEvent
  | ActivityExecutionPendingEvent;

type EventHandler<TEvent extends HistoryEvent> = (
  state: WorkflowState,
  event: TEvent
) => WorkflowState;

// deno-lint-ignore no-explicit-any
const handlers: Record<HistoryEvent["type"], EventHandler<any>> = {
  execution_completed: function (
    state: WorkflowState,
    { result, exception, source }: ActivityExecutionCompletedEvent
  ): WorkflowState {
    if (state.current.source !== source) {
      throw new Error(
        `integrity check error: not equal ${state.current.source} to ${source}`
      );
    }
    if (result !== undefined) {
      const cmd = state.generatorFn.next(result);
      if (cmd.done) {
        // function return
        return { ...state, result: cmd.value };
      }
      return { ...state, current: cmd.value };
    }
    state.generatorFn.throw(exception);
    return state;
  },
  execution_started: function (
    state: WorkflowState,
    _: ActivityExecutionStartedEvent
  ): WorkflowState {
    return state;
  },
  workflow_started: function (
    state: WorkflowState,
    _: ActivityExecutionStartedEvent
  ): WorkflowState {
    const cmd = state.generatorFn.next();
    if (cmd.done) {
      return { ...state, result: cmd.value };
    }
    return { ...state, current: cmd.value };
  },
  workflow_finished: function (
    state: WorkflowState,
    _: ActivityExecutionStartedEvent
  ): WorkflowState {
    return state;
  },
  execution_pending: function (
    state: WorkflowState,
    _: ActivityExecutionPendingEvent
  ): WorkflowState {
    return state;
  },
};

export function apply<TReturn>(
  workflowState: WorkflowState<TReturn>,
  event: HistoryEvent
): WorkflowState<TReturn> {
  return handlers[event.type](
    workflowState,
    // deno-lint-ignore no-explicit-any
    event as any
  ) as WorkflowState<TReturn>;
}
