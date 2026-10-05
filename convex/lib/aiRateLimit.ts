import { ConvexError } from "convex/values";
import { defineRateLimits } from "convex-helpers/server/rateLimit";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import { ensureAiBudget } from "./aiSpendGuard";
import { convexErrorData } from "./errorData";

// Per-caller limits on AI work, on top of the daily spend cap (lib/aiSpend.ts). The
// cap bounds the bill; these stop one caller from spending the whole day's budget.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Midnight Pacific Standard Time on 2026-01-01. The daily window starts from here, so it
// resets at midnight in Los Angeles like the spend ledger (1am during daylight time).
const LOS_ANGELES_MIDNIGHT = Date.UTC(2026, 0, 1, 8);

// The most cells one fillEmptyCells request may ask for. The matrix bucket holds one
// full request, so a first fill of the day never stops partway.
export const MATRIX_FILL_MAX_CELLS = 50;

export const { rateLimit, checkRateLimit } = defineRateLimits({
  // Feed generation, remix and team previews share one bucket per person (Clerk user
  // id): a burst of 10, then one every two minutes.
  aiRequest: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  // And at most 40 a day per person, to bound how much of the shared user budget one
  // account can spend.
  aiRequestDaily: { kind: "fixed window", rate: 40, period: DAY, start: LOS_ANGELES_MIDNIGHT },
  // Matrix fill: one token per attempted cell, per organization. One full request at
  // once, then 100 a day.
  matrixFillCell: { kind: "token bucket", rate: 100, period: DAY, capacity: MATRIX_FILL_MAX_CELLS },
});

export type AiRateLimitName = "aiRequest" | "aiRequestDaily" | "matrixFillCell";

const LIMIT_MESSAGES: Record<AiRateLimitName, string> = {
  aiRequest: ERROR_MESSAGES.AI_RATE_LIMITED,
  aiRequestDaily: ERROR_MESSAGES.AI_DAILY_LIMITED,
  // The matrix bucket refills over a day, not minutes.
  matrixFillCell: ERROR_MESSAGES.AI_MATRIX_FILL_LIMITED,
};

type RateLimitCtx = Pick<ActionCtx, "runMutation">;

function rateLimited(name: AiRateLimitName, retryAt: number | undefined) {
  return new ConvexError({ code: ERROR_CODES.AI_RATE_LIMITED, message: LIMIT_MESSAGES[name], retryAt });
}

/** Takes one token (or `count`) from the named limit, or throws AI_RATE_LIMITED. */
export async function ensureAiRateLimit(
  ctx: RateLimitCtx,
  args: { name: AiRateLimitName; key: string; count?: number },
): Promise<void> {
  const { ok, retryAt } = await ctx.runMutation(internal.internal.aiRateLimit.consumeAiRateLimit, args);
  if (!ok) throw rateLimited(args.name, retryAt);
}

/**
 * The per-person limits for feed generation, remix and team previews. A paused budget
 * refuses first, so it doesn't use up tokens; then both buckets are checked before
 * either is taken from, so a refusal by one doesn't cost a token from the other.
 */
export async function ensureAiRequestAllowed(
  ctx: RateLimitCtx & Pick<ActionCtx, "auth" | "runQuery">,
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  await ensureAiBudget(ctx, "user");
  const result = await ctx.runMutation(internal.internal.aiRateLimit.consumeAiRequestLimits, {
    key: identity.subject,
  });
  if (!result.ok) throw rateLimited(result.name, result.retryAt);
}

/** Whether an error is one the caller should stop on instead of retrying the next item. */
export function isAiStopError(error: unknown): boolean {
  const code = convexErrorData(error)?.code;
  return code === ERROR_CODES.AI_RATE_LIMITED || code === ERROR_CODES.AI_BUDGET_PAUSED;
}
