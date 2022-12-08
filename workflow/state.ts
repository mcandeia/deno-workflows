export interface WorkflowState<TReturn = unknown> {
  hasFinished: boolean;
  exception?: Error;
  result?: TReturn;
}
