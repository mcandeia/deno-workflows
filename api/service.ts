// deno-lint-ignore-file no-explicit-any
import { v4 } from "https://deno.land/std@0.72.0/uuid/mod.ts";
import { Arg } from "../types.ts";
import {
  DB,
  WorkflowExecution,
  WorkflowExecutor,
} from "../backends/backend.ts";
import { newEvent } from "../workers/events.ts";

/**
 * WorkflowCreationOptions is used for creating workflows of a given executionId.
 */
export interface WorkflowCreationOptions {
  executionId?: string;
  alias: string;
}

export class WorkflowService {
  constructor(protected backend: DB) {
  }

  /**
   * Get execution gets the execution from the database
   * @param executionId the executionId.
   * @returns the workflow execution
   */
  public async getExecution(
    executionId: string,
  ): Promise<WorkflowExecution | undefined> {
    return await this.backend.execution(executionId).get();
  }
  /**
   * register the given workflow function in the registry map.
   * let the workflow function to be available to execute.
   * by default uses the function name as the workflow alias
   * @param url the workflow url
   * @param alias the workflow alias
   */
  public async registerWorkflowOfType(
    alias: string,
    attrs: any,
    maybeType?: string,
  ): Promise<void> {
    const current = this.backend.executors.get(alias);
    const type = maybeType ?? "deno";
    if (current === undefined) {
      await this.backend.executors.insert({
        alias,
        type,
        ...attrs,
      });
    } else {
      await this.backend.executors.update({ alias, type, ...attrs });
    }
  }

  /**
   * List all configured workflows
   * @returns the configured workflow
   */
  public async listWorkflows(): Promise<WorkflowExecutor[]> {
    return await this.backend.executors.list();
  }

  /**
   * List all configured workflows
   * @returns the configured workflow
   */
  public async getWorkflow(
    alias: string,
  ): Promise<WorkflowExecutor | undefined> {
    return await this.backend.executors.get(alias);
  }

  /**
   * Signal the workflow with the given signal and payload.
   */
  public async signalWorkflow(
    executionId: string,
    signal: string,
    payload?: unknown,
  ): Promise<void> {
    await this.backend.execution(executionId).pending.add({
      ...newEvent(),
      type: "signal_received",
      signal,
      payload,
    });
  }

  /**
   * Creates a new workflow based on the provided options and returns the newly created workflow execution.
   * @param options the workflow creation options
   * @param input the workflow input
   */
  public async startWorkflow<TArgs extends Arg = Arg>(
    { alias, executionId }: WorkflowCreationOptions,
    input?: [...TArgs],
  ): Promise<WorkflowExecution> {
    const wkflowInstanceId = executionId ?? v4.generate();
    return await this.backend.withinTransaction(async (db) => {
      const execution = { alias, id: wkflowInstanceId };
      const executionsDB = db.execution(wkflowInstanceId);
      await executionsDB.create(execution); // cannot be parallelized
      await executionsDB.pending.add({
        ...newEvent(),
        type: "workflow_started",
        input,
      });
      return execution;
    });
  }
}
