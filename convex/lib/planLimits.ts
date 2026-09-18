export const AI_CYCLE_DAYS = 30;

/** Shared by enforcement, account usage, and the public pricing summary. */
export function getPlanAiLimit(plan: "free" | "team"): number {
  const configured = plan === "team"
    ? process.env.MAX_TEAM_AIGEN ?? process.env.MAX_CASUAL_AIGEN
    : process.env.MAX_FREE_AIGEN;
  const value = configured?.trim() ? Number(configured) : NaN;
  return Number.isSafeInteger(value) && value >= 0 ? value : plan === "team" ? 100 : 10;
}
