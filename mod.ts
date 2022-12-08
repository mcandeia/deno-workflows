import { WorkflowStartedEvent } from "./events.ts";
import { Arg } from "./types.ts";

/**
 * WorkflowCreationOptions is used for creating workflows of a given instanceId.
 */
export interface WorkflowCreationOptions {
  instanceId: string;
}

/**
 * WorkflowInstance is the workflow instance.
 */
export interface WorkflowInstance {
  instanceId: string;
}

/**
 * WorkflowClient provides friendly access to the underlying workflows services.
 */
export interface WorkflowClient {
  /**
   * Creates a new workflow based on the provided options and returns the newly created workflow instance.
   * @param options the workflow creation options
   * @param event the first event the will start the workflow.
   */
  createWorkflowInstance<TArgs extends Arg = Arg>(
    options: WorkflowCreationOptions,
    event: WorkflowStartedEvent<TArgs>
  ): Promise<WorkflowInstance>;
  /**
   * Cancel the workflow execution.
   * @param instance the instance that should be cancelled.
   */
  cancelWorkflowInstance(instance: WorkflowInstance): Promise<void>;
  /**
   * wait for the workflow to be completed
   * @param instance the workflow instance that's intended to be awaiting for
   * @param timeoutMs the timeout for the workflow completion
   */
  waitForWorkflowInstance(
    instance: WorkflowInstance,
    timeoutMs: number
  ): Promise<void>;
  /**
   * signal the workflow with the given {name}
   * @param instanceId the workflow instance id
   * @param name the name of the signals
   * @param args the signal arguments.
   */
  signalWorkflow(
    instanceId: string,
    name: string,
    args: unknown
  ): Promise<void>;
}