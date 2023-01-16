import { pLimit } from "https://deno.land/x/p_limit@v1.0.0/mod.ts";
import { Arg } from "./types.ts";

/**
 * identity returns the same value as it receives.
 */
export const identity = <T>(val: T): T => {
  return val;
};

/**
 * withConcurrency returns a wrapped function using the specified concurrency as a limiter.
 */
export const withConcurrency = <TArgs extends Arg = Arg, TResult = unknown>(
  concurrency: number,
  f: (...args: [...TArgs]) => TResult
): ((...args: [...TArgs]) => Promise<TResult>) => {
  const limiter = pLimit(concurrency);
  return (...args) => {
    return limiter(() => f(...args));
  };
};

/**
 * safeApply applies the given function to the parameter in case of the parameter is not undefined.
 */
export const tryApply =
  <T, U>(f: (v: T) => U) =>
  (v: T | undefined): U | undefined => {
    return v !== undefined ? f(v) : undefined;
  };

/**
 * parses the given integer if not undefined.
 */
export const tryParseInt = tryApply(parseInt);
