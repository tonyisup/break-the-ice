import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { AI_USAGE_CYCLE_MS, getAiPlanLimit } from "../lib/aiPlanLimits";
import { PACK_OFFER } from "../lib/packOffer";

/**
 * The numbers behind the pack offer, for the owner:
 * `npx convex run internal/packInterest:summary`.
 * `asked / shown` is the rate to read: both count each person once, for good. `atLimitNow` is
 * only people whose current cycle is used up, whether or not they came back and saw the
 * offer. A deleted account's row is gone from every count. Reads whole tables, which is fine
 * while they are small.
 */
export const summary = internalQuery({
  args: {},
  returns: v.object({
    offer: v.string(),
    aiLimit: v.number(),
    peopleWithAiUse: v.number(),
    atLimitNow: v.number(),
    shown: v.number(),
    shownOnFeed: v.number(),
    shownInRemix: v.number(),
    asked: v.number(),
    askedOnFeed: v.number(),
    askedInRemix: v.number(),
    wantNotice: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const aiLimit = getAiPlanLimit();

    // A person's use is their userAiUsage row, or the older users.aiUsage field when they
    // have no row yet (the same rule as getAiUsage in lib/aiUsage.ts).
    const usage = new Map<string, { count: number; cycleStart: number }>();
    for (const user of await ctx.db.query("users").collect()) {
      if (user.aiUsage) usage.set(user._id, user.aiUsage);
    }
    for (const row of await ctx.db.query("userAiUsage").collect()) {
      usage.set(row.userId, { count: row.count, cycleStart: row.cycleStart });
    }
    const all = [...usage.values()];
    const current = all.filter((u) => now - u.cycleStart <= AI_USAGE_CYCLE_MS);

    const rows = (await ctx.db.query("packInterest").collect()).filter((row) => row.offer === PACK_OFFER.id);
    const asked = rows.filter((row) => row.clickedAt !== undefined);
    return {
      offer: PACK_OFFER.id,
      aiLimit,
      peopleWithAiUse: all.filter((u) => u.count > 0).length,
      atLimitNow: current.filter((u) => u.count >= aiLimit).length,
      shown: rows.length,
      shownOnFeed: rows.filter((row) => row.surface === "feed").length,
      shownInRemix: rows.filter((row) => row.surface === "remix").length,
      asked: asked.length,
      askedOnFeed: asked.filter((row) => row.clickedSurface === "feed").length,
      askedInRemix: asked.filter((row) => row.clickedSurface === "remix").length,
      wantNotice: rows.filter((row) => row.notifyRequestedAt !== undefined).length,
    };
  },
});
