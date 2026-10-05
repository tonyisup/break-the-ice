import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  checkDayLimit,
  checkRateLimit,
  giveBackDayLimit,
  isDayLimit,
  rateLimit,
  resetDayLimit,
  takeDayLimit,
} from "../lib/aiRateLimit";

export const consumeAiRateLimit = internalMutation({
  args: {
    name: v.union(v.literal("aiRequest"), v.literal("aiRequestDaily"), v.literal("matrixFillCell")),
    key: v.string(),
    count: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean(), retryAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    // convex-helpers takes count as given: a negative or NaN count would add tokens or
    // disable the bucket for good.
    if (args.count !== undefined && (!Number.isInteger(args.count) || args.count < 1)) {
      throw new Error("Rate limit count must be a positive integer");
    }
    const { name, key, count } = args;
    if (isDayLimit(name)) {
      const taken = await takeDayLimit(ctx, { name, key, count });
      return taken.ok ? { ok: true } : { ok: false, retryAt: taken.retryAt };
    }
    const { ok, retryAt } = await rateLimit(ctx, { name, key, count });
    return { ok, retryAt: retryAt ?? undefined };
  },
});

/**
 * Takes one request from each per-person request limit (aiRequest, aiRequestDaily), only if both
 * have room and the person has an unanswered-call slot left.
 */
export const consumeAiRequestLimits = internalMutation({
  args: { key: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      name: v.union(v.literal("aiRequest"), v.literal("aiRequestDaily"), v.literal("aiUnanswered")),
      retryAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { key }) => {
    const bucket = await checkRateLimit(ctx, { name: "aiRequest", key });
    if (!bucket.ok) return { ok: false as const, name: "aiRequest" as const, retryAt: bucket.retryAt ?? undefined };
    // An unanswered-call slot is only held around the provider call itself (holdAiUnanswered).
    // A person with none left is refused here, before the request takes anything from them.
    for (const name of ["aiRequestDaily", "aiUnanswered"] as const) {
      const check = await checkDayLimit(ctx, { name, key });
      if (!check.ok) return { ok: false as const, name, retryAt: check.retryAt };
    }
    await rateLimit(ctx, { name: "aiRequest", key });
    await takeDayLimit(ctx, { name: "aiRequestDaily", key });
    return { ok: true as const };
  },
});

/** Whether a person has an unanswered-call slot left today. Takes nothing. */
export const checkAiUnanswered = internalMutation({
  args: { key: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), retryAt: v.number() })),
  handler: async (ctx, args) => {
    const check = await checkDayLimit(ctx, { name: "aiUnanswered", key: args.key });
    return check.ok ? { ok: true as const } : check;
  },
});

/** Holds one of a person's unanswered-call slots for the current spend day, if one is left. */
export const holdAiUnanswered = internalMutation({
  args: { key: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), row: v.id("rateLimits"), day: v.string() }),
    v.object({ ok: v.literal(false), retryAt: v.number() }),
  ),
  handler: async (ctx, args) => {
    return await takeDayLimit(ctx, { name: "aiUnanswered", key: args.key });
  },
});

/** Gives back a slot that was held on `day`, to the row it was held in. */
export const releaseAiUnanswered = internalMutation({
  args: { row: v.id("rateLimits"), day: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await giveBackDayLimit(ctx, { name: "aiUnanswered", row: args.row, day: args.day });
    return null;
  },
});

/**
 * Gives one person all of their unanswered-call slots back, for an operator to run after a
 * provider incident. `key` is the person's Clerk user id (`clerkId` on their `users` row):
 * `npx convex run internal/aiRateLimit:resetAiUnanswered '{"key":"<Clerk user id>"}'`
 * (add `--prod` after `run` for production). `reset: false` means that id has no slot row, so
 * nothing changed: check the id and the deployment. Their calls that are still running stop
 * being counted, and give nothing back when they end.
 */
export const resetAiUnanswered = internalMutation({
  args: { key: v.string() },
  returns: v.union(
    v.object({ reset: v.literal(true), slotsLeftBefore: v.number() }),
    v.object({ reset: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const left = await resetDayLimit(ctx, { name: "aiUnanswered", key: args.key });
    return left === null ? { reset: false as const } : { reset: true as const, slotsLeftBefore: left };
  },
});
