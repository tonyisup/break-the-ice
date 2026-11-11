/** Shared by enforcement and account usage. */
export const AI_USAGE_CYCLE_DAYS = 30;
export const AI_USAGE_CYCLE_MS = AI_USAGE_CYCLE_DAYS * 24 * 60 * 60 * 1000;

/** How many AI requests each person gets per cycle. */
export function getAiPlanLimit() {
  const limit = Number(process.env.MAX_FREE_AIGEN ?? "10");
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("Invalid AI allowance");
  }
  return limit;
}
