import { v } from "convex/values";
import { internalMutation, internalQuery, MutationCtx, QueryCtx } from "../_generated/server";
import { isWithinBudget } from "../lib/aiSpend";

const spendClassValidator = v.union(v.literal("user"), v.literal("system"));
type SpendClass = "user" | "system";

async function spentOn(ctx: QueryCtx, day: string): Promise<{ user: number; system: number }> {
  const rows = await ctx.db
    .query("aiSpendDays")
    .withIndex("by_day_class", (q) => q.eq("day", day))
    .collect();
  const spent = { user: 0, system: 0 };
  for (const row of rows) spent[row.spendClass] += row.costUsd;
  return spent;
}

// Settling swaps an estimate for the real cost; rounding keeps float noise out of the ledger.
const toBillionths = (usd: number) => Math.round(usd * 1e9) / 1e9;

async function addToLedger(
  ctx: MutationCtx,
  day: string,
  spendClass: SpendClass,
  deltaUsd: number,
  calls: number,
): Promise<void> {
  // A NaN total would fail every later budget check that day and never reach the hard cap.
  if (!Number.isFinite(deltaUsd)) throw new Error("AI spend amounts must be finite numbers.");
  const existing = await ctx.db
    .query("aiSpendDays")
    .withIndex("by_day_class", (q) => q.eq("day", day).eq("spendClass", spendClass))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      costUsd: Math.max(0, toBillionths(existing.costUsd + deltaUsd)),
      calls: existing.calls + calls,
    });
  } else {
    await ctx.db.insert("aiSpendDays", { day, spendClass, costUsd: Math.max(0, toBillionths(deltaUsd)), calls });
  }
}

const budgetArgs = {
  spendClass: spendClassValidator,
  day: v.string(),
  budgetUsd: v.number(),
  hardCapUsd: v.number(),
};

/**
 * Whether a call of this class may run on `day`, given that day's spend (including
 * reservations for calls in flight) and the caps. A cheap early refusal: the
 * reservation below is the check that holds under concurrency. The caller passes the
 * day and caps, because a query that read the clock or env vars could be served from
 * cache after midnight or a cap change.
 */
export const checkAiBudget = internalQuery({
  args: budgetArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return isWithinBudget(args.spendClass, await spentOn(ctx, args.day), args);
  },
});

/**
 * Checks the budget and sets aside `reserveUsd` for one call in the same transaction,
 * so calls started at the same moment can't all pass on the same remaining budget.
 */
export const reserveAiSpend = internalMutation({
  args: { ...budgetArgs, reserveUsd: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!isWithinBudget(args.spendClass, await spentOn(ctx, args.day), args)) return false;
    await addToLedger(ctx, args.day, args.spendClass, args.reserveUsd, 0);
    return true;
  },
});

/** Replaces a call's reservation with what it actually cost, and stores its usage on the run. */
export const settleAiSpend = internalMutation({
  args: {
    spendClass: spendClassValidator,
    day: v.string(),
    reservedUsd: v.number(),
    costUsd: v.number(),
    runId: v.optional(v.id("generationRuns")),
    resolvedModel: v.optional(v.string()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // A retried settle whose first attempt committed (only its response was lost) must
    // not apply the adjustment twice: the run's recorded cost marks it as settled.
    const run = args.runId ? await ctx.db.get(args.runId) : null;
    if (run?.costUsd !== undefined) return null;

    await addToLedger(ctx, args.day, args.spendClass, args.costUsd - args.reservedUsd, 1);

    if (run && args.runId) {
      await ctx.db.patch(args.runId, {
        costUsd: args.costUsd,
        resolvedModel: args.resolvedModel,
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
      });
    }
    return null;
  },
});

/** Gives back a reservation whose call failed before the provider returned anything. */
export const releaseAiSpend = internalMutation({
  args: { spendClass: spendClassValidator, day: v.string(), reservedUsd: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addToLedger(ctx, args.day, args.spendClass, -args.reservedUsd, 0);
    return null;
  },
});
