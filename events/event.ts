export interface Event {
  id: string;
  timestamp: Date;
}

export interface WorkflowStartedEvent extends Event {
  type: "workflow_started";
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

export type HistoryEvent =
  | ActivityExecutionStartedEvent
  | ActivityExecutionCompletedEvent
  | WorkflowStartedEvent;
