import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { PACK_OFFER } from "../lib/packOffer";
import { findCanonicalUser } from "../lib/users";
import { getUserOrCreate } from "./users";

/**
 * Nothing is on sale yet. This measures whether people who run out of AI generations would
 * pay for more: PACK_OFFER is shown where the allowance ends, and seeing it, asking for it and
 * asking to be told when it is on sale are recorded here instead of starting a checkout. Kept
 * in the database, not in analytics, so a person who declined analytics cookies still counts.
 */
const surface = v.union(v.literal("feed"), v.literal("remix"));

/** What the caller has already done with the offer, so it opens where they left it. */
export const getMine = query({
  args: {},
  returns: v.object({ shown: v.boolean(), clicked: v.boolean(), notify: v.boolean() }),
  handler: async (ctx) => {
    const none = { shown: false, clicked: false, notify: false };
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return none;
    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });
    if (!user) return none;
    const rows = await ctx.db
      .query("packInterest")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const row = rows.find((r) => r.offer === PACK_OFFER.id);
    if (!row) return none;
    return {
      shown: true,
      clicked: row.clickedAt !== undefined,
      notify: row.notifyRequestedAt !== undefined,
    };
  },
});

/**
 * Records a step the caller took with the offer, in one row per person: `shown` (they saw
 * it), `asked` (they pressed the button) or `notify` (they also want to be told when packs
 * are on sale). Each step is kept from the first time it happens and never taken back.
 * `offer` is the one the page showed: a page still showing an earlier offer records nothing,
 * so answers to different terms stay apart.
 */
export const record = mutation({
  args: {
    offer: v.string(),
    surface,
    step: v.union(v.literal("shown"), v.literal("asked"), v.literal("notify")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);
    if (args.offer !== PACK_OFFER.id) return null;
    const now = Date.now();
    const asked = args.step !== "shown";
    const rows = await ctx.db
      .query("packInterest")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const row = rows.find((r) => r.offer === PACK_OFFER.id);
    if (!row) {
      await ctx.db.insert("packInterest", {
        userId: user._id,
        offer: PACK_OFFER.id,
        surface: args.surface,
        shownAt: now,
        clickedAt: asked ? now : undefined,
        clickedSurface: asked ? args.surface : undefined,
        notifyRequestedAt: args.step === "notify" ? now : undefined,
      });
      return null;
    }
    const patch: { clickedAt?: number; clickedSurface?: "feed" | "remix"; notifyRequestedAt?: number } = {};
    if (asked && row.clickedAt === undefined) {
      patch.clickedAt = now;
      patch.clickedSurface = args.surface;
    }
    if (args.step === "notify" && row.notifyRequestedAt === undefined) patch.notifyRequestedAt = now;
    if (Object.keys(patch).length > 0) await ctx.db.patch(row._id, patch);
    return null;
  },
});
