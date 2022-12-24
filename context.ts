import {
  makeSeededGenerators,
  RandomGenerators,
} from "https://raw.githubusercontent.com/alextes/vegas/main/mod.ts";
import { CommandBase, ScheduleActivityCommand } from "./commands.ts";
import { PromiseOrValue } from "./promise.ts";
import { Arg } from "./types.ts";
export type ActivityResult<T> = PromiseOrValue<T>;

/**
 * Returns if the given activity result is a generator or not.
 * @param value the activity result
 * @returns a typeguard for activity result.
 */
export const isValue = <T>(value: ActivityResult<T>): value is T => {
  return (
    (value as Generator).next === undefined &&
    (value as Promise<T>).then === undefined
  );
};

/**
 * Activity is the signature of any activity.
 */
export type Activity<TArgs extends Arg, TResult> = (
  ctx: WorkflowContext,
  ...args: [...TArgs]
) => ActivityResult<TResult>;

/**
 * Activity executor receives an activity and executes it.
 */
export type ActivityExecutor<TArgs extends Arg, TResult> = (
  activity: Activity<TArgs, TResult>,
  ...args: [...TArgs]
) => ActivityResult<TResult>;

/**
 * WorkflowContext is used for providing api access to the workflow engine.
 */
export class WorkflowContext {
  private rand: RandomGenerators;
  constructor(public instanceId: string) {
    this.rand = makeSeededGenerators(instanceId);
  }
  /**
   * Executes the activity for the given context and args.
   * @param activity the activity that should be executed
   * @param args the activity args (optionally)
   */
  public callActivity<TArgs extends Arg = Arg, TResult = unknown>(
    activity: Activity<TArgs, TResult>,
    ...args: [...TArgs]
  ): CommandBase {
    return new ScheduleActivityCommand<TArgs, TResult>(activity, this, args);
  }

  /**
   * Returns a random consistent with the given workflow execution
   * @returns a random float value.
   */
  public random(): number {
    return this.rand.randomInt(0, Number.MAX_SAFE_INTEGER);
  }
}
