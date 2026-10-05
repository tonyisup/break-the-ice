import { ConvexError } from "convex/values";
import { defineRateLimits } from "convex-helpers/server/rateLimit";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import { nextSpendDayStart, spendDay, type SpendClass } from "./aiSpend";
import { ensureAiBudget } from "./aiSpendGuard";
import { convexErrorData } from "./errorData";

// Per-caller limits on AI work, on top of the daily spend cap (lib/aiSpend.ts). The
// cap bounds the bill; these bound how much of the day's budget one caller can spend.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The most cells one fillEmptyCells request may ask for. The matrix bucket holds one
// full request, so a first fill of the day never stops partway.
export const MATRIX_FILL_MAX_CELLS = 50;

export const { rateLimit, checkRateLimit } = defineRateLimits({
  // Feed generation, remix and team previews share one bucket per person (Clerk user
  // id): a burst of 10, then one every two minutes.
  aiRequest: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  // Matrix fill: one token per attempted cell, per organization. One full request at
  // once, then 100 a day.
  matrixFillCell: { kind: "token bucket", rate: 100, period: DAY, capacity: MATRIX_FILL_MAX_CELLS },
});

// Limits counted per spend day (spendDay in lib/aiSpend.ts), so they reset with the ledger at
// midnight in Los Angeles all year. A fixed 24-hour window can't follow that day: anchored in
// standard time it resets at 1am for the whole of daylight time.
export const DAY_LIMITS = {
  // At most 40 requests a day per person, to bound how much of the shared user budget one
  // account can spend.
  aiRequestDaily: 40,
  // And at most 5 provider calls a day per person that are still running, that kept their
  // reservation without an answer (keepAiReservation in lib/aiSpendGuard.ts), or whose answer
  // was cut off by the output cap. Such a call is charged to the shared budget while, as a
  // rule, the person's plan use is given back, so the request limits alone don't bound what
  // one account can spend on them. A cut-off answer counts even in the rare case where the
  // use is kept. Running calls count, so the five also cover what a person has in flight at
  // once.
  aiUnanswered: 5,
} as const;

export type DayLimitName = keyof typeof DAY_LIMITS;
export type AiRateLimitName = "aiRequest" | "matrixFillCell" | DayLimitName;
/** The limits a count is taken from directly. An unanswered-call slot is held and given back. */
export type AiCountedLimitName = Exclude<AiRateLimitName, "aiUnanswered">;

export function isDayLimit(name: AiRateLimitName): name is DayLimitName {
  return name in DAY_LIMITS;
}

type LimitDb = Pick<MutationCtx, "db">;
type DayLimitArgs = { name: DayLimitName; key: string; count?: number };

async function dayLimitRow(ctx: LimitDb, name: DayLimitName, key: string) {
  return await ctx.db
    .query("rateLimits")
    .withIndex("name", (q) => q.eq("name", name).eq("key", key))
    .unique();
}

/**
 * Whether `count` more fit in `key`'s limit for the current spend day. Takes nothing. A row
 * holds what is left for the spend day its `ts` falls in (when it was last taken from; for a
 * row from the fixed window this replaced, the start of its window). On a later day the whole
 * limit is back, and a refusal's `retryAt` is when that day starts. For the unanswered-call
 * slots that is the latest a refusal can last: a slot held by a call still running comes back
 * when the call is answered.
 */
export async function checkDayLimit(ctx: LimitDb, args: DayLimitArgs) {
  const now = Date.now();
  const row = await dayLimitRow(ctx, args.name, args.key);
  const left = row && spendDay(row.ts) === spendDay(now) ? row.value : DAY_LIMITS[args.name];
  const value = left - (args.count ?? 1);
  if (value < 0) return { ok: false as const, retryAt: nextSpendDayStart(now) };
  return { ok: true as const, row, value, now };
}

/** Takes `count` from the limit when they fit, and says which row and spend day they were taken on. */
export async function takeDayLimit(ctx: LimitDb, args: DayLimitArgs) {
  const check = await checkDayLimit(ctx, args);
  if (!check.ok) return check;
  const { row, value, now } = check;
  if (row) await ctx.db.patch(row._id, { value, ts: now });
  const rowId = row ? row._id : await ctx.db.insert("rateLimits", { name: args.name, key: args.key, value, ts: now });
  return { ok: true as const, row: rowId, day: spendDay(now) };
}

/**
 * Gives one back to the row it was taken from, unless the limit has moved on from the spend
 * day it was taken on. A row that was reset since (resetDayLimit) is gone, so what was taken
 * before the reset adds nothing to the row that replaces it.
 */
export async function giveBackDayLimit(
  ctx: LimitDb,
  args: { name: DayLimitName; row: Id<"rateLimits">; day: string },
): Promise<void> {
  const row = await ctx.db.get(args.row);
  if (!row || row.name !== args.name || spendDay(row.ts) !== args.day) return;
  await ctx.db.patch(row._id, { value: Math.min(DAY_LIMITS[args.name], row.value + 1) });
}

/**
 * Gives `key` the whole limit back by removing its row. Returns what `key` had left today, or
 * null when there was no row to remove.
 */
export async function resetDayLimit(
  ctx: LimitDb,
  args: { name: DayLimitName; key: string },
): Promise<number | null> {
  const row = await dayLimitRow(ctx, args.name, args.key);
  if (!row) return null;
  await ctx.db.delete(row._id);
  return spendDay(row.ts) === spendDay(Date.now()) ? row.value : DAY_LIMITS[args.name];
}

const LIMIT_MESSAGES: Record<AiRateLimitName, string> = {
  aiRequest: ERROR_MESSAGES.AI_RATE_LIMITED,
  aiRequestDaily: ERROR_MESSAGES.AI_DAILY_LIMITED,
  aiUnanswered: ERROR_MESSAGES.AI_UNANSWERED_LIMITED,
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
  args: { name: AiCountedLimitName; key: string; count?: number },
): Promise<void> {
  const { ok, retryAt } = await ctx.runMutation(internal.internal.aiRateLimit.consumeAiRateLimit, args);
  if (!ok) throw rateLimited(args.name, retryAt);
}

/**
 * The per-person limits for feed generation, remix and team previews. A paused budget
 * refuses first, so it doesn't use up tokens; then every limit is checked before any is
 * taken from, so a refusal by one doesn't cost a token from another.
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

/** A held unanswered-call slot: the person's row it was taken from and the spend day it was taken on. */
export type AiUnansweredSlot = { row: Id<"rateLimits">; day: string };

/**
 * Refuses a signed-in caller who has no unanswered-call slot left, before their request takes
 * anything else. Takes nothing itself: the slot is held around the provider call
 * (holdAiUnanswered), which is the check that holds for calls started together.
 */
export async function ensureAiUnansweredLeft(ctx: RateLimitCtx & Pick<ActionCtx, "auth">): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return;
  const check = await ctx.runMutation(internal.internal.aiRateLimit.checkAiUnanswered, { key: identity.subject });
  if (!check.ok) throw rateLimited("aiUnanswered", check.retryAt);
}

/**
 * Holds one of the signed-in caller's unanswered-call slots (DAY_LIMITS.aiUnanswered) for a
 * user-spend provider call, or throws AI_RATE_LIMITED when none is left. The slot is given back
 * with releaseAiUnanswered once the call is answered in full or wasn't billed; otherwise it
 * stays held for the rest of the spend day. System spend holds nothing, and neither does a
 * call nobody is signed in for.
 */
export async function holdAiUnanswered(
  ctx: RateLimitCtx & Pick<ActionCtx, "auth">,
  spendClass: SpendClass,
): Promise<AiUnansweredSlot | null> {
  if (spendClass !== "user") return null;
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    // Every user-spend call is a signed-in request today, also the ones made from an action
    // another action runs. Without the caller there is nobody to count the call against.
    console.warn("A user-spend AI call has no signed-in caller, so it holds no unanswered-call slot");
    return null;
  }
  const held = await ctx.runMutation(internal.internal.aiRateLimit.holdAiUnanswered, { key: identity.subject });
  if (!held.ok) throw rateLimited("aiUnanswered", held.retryAt);
  return { row: held.row, day: held.day };
}

/** Gives a held slot back. Never throws. */
export async function releaseAiUnanswered(ctx: RateLimitCtx, slot: AiUnansweredSlot | null): Promise<void> {
  if (!slot) return;
  try {
    await ctx.runMutation(internal.internal.aiRateLimit.releaseAiUnanswered, slot);
  } catch (error) {
    // The slot stays held until the next spend day, which errs on the side of spending less.
    console.error("Failed to give back an unanswered-call slot", error);
  }
}

/**
 * Whether an error is one the caller should stop on instead of retrying the next item. A batch
 * also stops on a call that kept its reservation (keptAiReservation in lib/aiSpendGuard.ts).
 */
export function isAiStopError(error: unknown): boolean {
  const code = convexErrorData(error)?.code;
  return code === ERROR_CODES.AI_RATE_LIMITED || code === ERROR_CODES.AI_BUDGET_PAUSED;
}
