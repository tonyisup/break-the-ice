import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createPendingSubscription = internalMutation({
  args: {
    email: v.string(),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("pendingSubscriptions", {
      email: args.email,
      token: args.token,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const consumePendingSubscription = internalMutation({
  args: {
    token: v.string(),
  },
  returns: v.union(v.object({ email: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pendingSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!subscription) {
      return null;
    }

    // Check expiry (24 hours)
    const now = Date.now();
    const expiry = 24 * 60 * 60 * 1000;
    if (now - subscription.createdAt > expiry) {
      await ctx.db.delete(subscription._id);
      throw new Error("Subscription link expired.");
    }

    await ctx.db.delete(subscription._id);
    return { email: subscription.email };
  },
});
