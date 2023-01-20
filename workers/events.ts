import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";
import { Arg } from "../types.ts";

/**
 * Event is the base event
 */
export interface Event {
  type: string;
  id: string;
  timestamp: Date;
  seq: number;
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

export const newEvent = (): Omit<Event, "type"> => {
  return {
    id: v4.generate(),
    timestamp: new Date(),
    seq: 0,
  };
};
