/** Shared by enforcement, account usage, and the public pricing summary. */
export const AI_USAGE_CYCLE_DAYS = 30;
export const AI_USAGE_CYCLE_MS = AI_USAGE_CYCLE_DAYS * 24 * 60 * 60 * 1000;

export function getAiPlanLimit(planTier: "free" | "team") {
  const configured =
    planTier === "team"
      ? (process.env.MAX_TEAM_AIGEN ?? process.env.MAX_CASUAL_AIGEN ?? "100")
      : (process.env.MAX_FREE_AIGEN ?? "10");
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error(`Invalid AI allowance for ${planTier} plan`);
  }
  return limit;
}
