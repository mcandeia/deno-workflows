import { CommandBase, ScheduleActivityCommand } from "../commands/command.ts";
import {
  makeSeededGenerators,
  RandomGenerators,
} from "https://raw.githubusercontent.com/alextes/vegas/main/mod.ts";
//import { crypto } from "std/crypto/mod.ts";
export type Arg = readonly unknown[];
export type ActivityResult<T> =
  // deno-lint-ignore no-explicit-any
  Generator<CommandBase, T | Promise<T>, any> | T | Promise<T>;

/**
 * Returns if the given activity result is a generator or not.
 * @param value the activity result
 * @returns a typeguard for activity result.
 */
export const isValue = <T>(value: ActivityResult<T>): value is T => {
  return (value as Generator).next === undefined;
};
export type Activity<TResult, TArgs extends Arg> = (
  ctx: WorkflowContext,
  ...args: [...TArgs]
) => ActivityResult<TResult>;

export type ActivityExecutor<TResult, TArgs extends Arg> = (
  activity: Activity<TResult, TArgs>,
  ...args: [...TArgs]
) => ActivityResult<TResult>;

/**
 * WorkflowContext is used for providing api access to the workflow engine.
 */
export class WorkflowContext {
  private rand: RandomGenerators;
  private signals: Map<string, (v: unknown) => void>;
  constructor(public instanceId: string) {
    this.rand = makeSeededGenerators(instanceId);
    this.signals = new Map();
  }
  /**
   * Executes the activity for the given context and args.
   * @param activity the activity that should be executed
   * @param args the activity args (optionally)
   */
  public callActivity<TResult, TArgs extends Arg>(
    activity: Activity<TResult, TArgs>,
    ...args: [...TArgs]
  ): CommandBase {
    return new ScheduleActivityCommand<TArgs, TResult>(activity, this, args);
  }

  /**
   * Wait for signal adds a signal pending callback
   * @param signal the signal name
   * @param callback the signal callback
   */
  public waitForSignal(signal: string, callback: (v: unknown) => void) {
    this.signals.set(signal, callback);
  }

  /**
   * Returns a random consistent with the given workflow execution
   * @returns a random float value.
   */
  public random(): number {
    return this.rand.randomInt(0, Number.MAX_SAFE_INTEGER);
  }
}
