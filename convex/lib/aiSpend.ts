// Daily AI spend cap. Every chat completion is checked against today's spend
// before it runs and recorded with its real cost after it returns. A call that may
// have been billed without reporting a cost is recorded at the amount reserved for it.
//
// "user" spend is anything a signed-in user can trigger (feed generation, remix,
// matrix fill, team previews). "system" spend is the daily email and admin tools,
// which don't count against the user budget, so abuse can't starve them. Both stop
// at the hard cap. Change either cap with the Convex env vars below, no deploy needed.

import { getZonedCalendarDate } from "./timezone";

export type SpendClass = "user" | "system";

export const DEFAULT_DAILY_BUDGET_USD = 1;
export const DEFAULT_DAILY_HARD_CAP_USD = 5;
// Charged when the provider reports no cost, so an unpriced call still counts.
export const FALLBACK_COST_PER_CALL_USD = 0.02;
// Set aside before each call and settled to the real cost after it returns. Also the charge
// for a call that times out or whose answer can't be read.
export const RESERVE_PER_CALL_USD = FALLBACK_COST_PER_CALL_USD;

const SPEND_TIME_ZONE = "America/Los_Angeles";

/** The spend day (Los Angeles, like the daily email) as YYYY-MM-DD. */
export function spendDay(now: number): string {
  return getZonedCalendarDate(new Date(now), SPEND_TIME_ZONE).isoDate;
}

// A call's prompt is capped so no caller can make one call cost far more than the
// cents the cap assumes: the budget is checked before a call and charged after it.
// Real prompts run 4-5k characters.
export const MAX_PROMPT_CHARS = 40_000;

function readUsd(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) return value;
  console.warn(`${name}="${raw}" is not a dollar amount; using the default $${fallback}`);
  return fallback;
}

export function dailyCaps(): { budgetUsd: number; hardCapUsd: number } {
  const caps = {
    budgetUsd: readUsd("AI_DAILY_BUDGET_USD", DEFAULT_DAILY_BUDGET_USD),
    hardCapUsd: readUsd("AI_DAILY_HARD_CAP_USD", DEFAULT_DAILY_HARD_CAP_USD),
  };
  if (caps.budgetUsd >= caps.hardCapUsd) {
    // User spend can then reach the hard cap and stop the daily email and admin tools too.
    console.warn(`AI_DAILY_BUDGET_USD ($${caps.budgetUsd}) is not below AI_DAILY_HARD_CAP_USD ($${caps.hardCapUsd})`);
  }
  return caps;
}

export function isWithinBudget(
  spendClass: SpendClass,
  spent: { user: number; system: number },
  caps: { budgetUsd: number; hardCapUsd: number },
): boolean {
  if (spent.user + spent.system >= caps.hardCapUsd) return false;
  return spendClass === "system" || spent.user < caps.budgetUsd;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Cost and token counts from an OpenRouter completion's `usage` (cost is in USD credits). */
export function completionUsage(usage: unknown): {
  costUsd: number;
  promptTokens?: number;
  completionTokens?: number;
} {
  const fields = (typeof usage === "object" && usage !== null ? usage : {}) as Record<string, unknown>;
  return {
    costUsd: finiteNonNegative(fields.cost) ?? FALLBACK_COST_PER_CALL_USD,
    promptTokens: finiteNonNegative(fields.prompt_tokens),
    completionTokens: finiteNonNegative(fields.completion_tokens),
  };
}
