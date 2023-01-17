export const valueOrNull = (v: string | undefined): string => {
  return `${v ? "'" + v + "'" : "NULL"}`;
};
