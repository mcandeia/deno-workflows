export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const identity = <T>(val: T): T => {
  return val;
};
