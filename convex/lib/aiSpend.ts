// Daily AI spend cap. Every chat completion is checked against today's spend
// before it runs and recorded with its real cost after it returns.
//
// "user" spend is anything a signed-in user can trigger (feed generation, remix,
// matrix fill, team previews). "system" spend is the daily email and admin tools,
// which don't count against the user budget, so abuse can't starve them. Both stop
// at the hard cap. Change either cap with the Convex env vars below, no deploy needed.

import { getZonedCalendarDate } from "./timezone";

export type SpendClass = "user" | "system";

export const DEFAULT_DAILY_BUDGET_USD = 1;
export const DEFAULT_DAILY_HARD_CAP_USD = 5;
// The least a call is set aside or charged at, so an unpriced call still counts.
export const FALLBACK_COST_PER_CALL_USD = 0.02;

type TokenPrice = { input: number; output: number };

/**
 * What a call costs at `price` if it uses its whole output cap: the prompt counted at 3 UTF-8
 * bytes a token (English runs nearer 4 a token; a script that takes about a token a character
 * takes about 3 bytes a character) plus the cap. Prices are US dollars per million tokens.
 */
export function worstCaseCallCostUsd(promptBytes: number, maxOutputTokens: number, price: TokenPrice): number {
  return (Math.ceil(promptBytes / 3) * price.input + maxOutputTokens * price.output) / 1_000_000;
}

/**
 * What to set aside for one call before it runs, settled to the real cost after it returns:
 * its worst case, and never less than the fallback. A call without a whole, positive output
 * cap could cost anything, so it is refused.
 */
export function callReserveUsd(promptBytes: number, maxOutputTokens: unknown, price: TokenPrice): number {
  if (typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new Error("An AI call needs a whole, positive output cap.");
  }
  return Math.max(FALLBACK_COST_PER_CALL_USD, worstCaseCallCostUsd(promptBytes, maxOutputTokens, price));
}

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

/**
 * Cost and token counts from an OpenRouter completion's `usage` (cost is in USD credits). A
 * call with no reported cost is charged `unpricedCostUsd`.
 */
export function completionUsage(usage: unknown, unpricedCostUsd: number): {
  costUsd: number;
  promptTokens?: number;
  completionTokens?: number;
} {
  const fields = (typeof usage === "object" && usage !== null ? usage : {}) as Record<string, unknown>;
  return {
    costUsd: finiteNonNegative(fields.cost) ?? unpricedCostUsd,
    promptTokens: finiteNonNegative(fields.prompt_tokens),
    completionTokens: finiteNonNegative(fields.completion_tokens),
  };
}
