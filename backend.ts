import {
  HistoryEvent,
  WorkflowCancelledEvent,
  WorkflowStartedEvent,
} from "./events.ts";
import { WorkflowInstance } from "./mod.ts";
import { WorkflowState } from "./state.ts";
import { Arg } from "./types.ts";

/**
 * Backend is the storage backend used for the workflows.
 */
export interface Backend {
  /**
   * creates a new workflow instance
   * @param instance the workflow instance.
   * @param startedEvent the workflow started event
   */
  createWorkflowInstance<TArgs extends Arg = Arg>(
    instance: WorkflowInstance,
    startedEvent: WorkflowStartedEvent<TArgs>
  ): Promise<void>;
  /**
   * cancelWorkflowInstance cancels the current workflow instance
   * @param instance the workflow instance
   * @param cancelEvent the cancel event
   */
  cancelWorkflowInstance(
    instance: WorkflowInstance,
    cancelEvent: WorkflowCancelledEvent
  ): Promise<void>;

  /**
   * getWorkflowHistory returns the current workflow history for the given instance
   * @param instance the workflow instance
   * @returns the list of history events
   */
  getWorkflowInstanceHistory(
    instance: WorkflowInstance
  ): Promise<HistoryEvent[]>;

  /**
   * signal the given workflow instance with the given event.
   * @param instanceId
   * @param event the signal event.
   */
  signalWorkflow(instanceId: string, event: HistoryEvent): Promise<void>;

  /**
   * Return the current workflow instance state.
   * @param instanceId the instance id
   */
  getWorkflowInstanceState<TArgs extends Arg = Arg, TResult = unknown>(
    instanceId: WorkflowInstance
  ): Promise<WorkflowState<TArgs, TResult>>;
}
