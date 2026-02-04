import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submitFeedback = mutation({
  args: {
    text: v.string(),
    pageUrl: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let userId;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email))
        .unique();

      if (user) {
        userId = user._id;
      }
    }

    // Rate limiting: Limit to 5 submissions per hour per user/session
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let recentFeedback;

    if (userId) {
      recentFeedback = await ctx.db
        .query("feedback")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .filter((q) => q.gt(q.field("createdAt"), oneHourAgo))
        .collect();
    } else if (args.sessionId) {
      recentFeedback = await ctx.db
        .query("feedback")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) => q.gt(q.field("createdAt"), oneHourAgo))
        .collect();
    }

    if (recentFeedback && recentFeedback.length >= 5) {
      throw new Error("You've sent several messages recently. Please try again in an hour.");
    }

    await ctx.db.insert("feedback", {
      text: args.text,
      pageUrl: args.pageUrl,
      userId: userId,
      sessionId: args.sessionId,
      createdAt: Date.now(),
      status: "new",
    });
  },
});

export const getFeedback = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: You must be logged in to submit feedback.");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) {
      throw new Error("User not found in database.");
    }
    if (!user.isAdmin) {
      throw new Error("Unauthorized: You must be an admin to view feedback.");
    }
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    return await Promise.all(
      feedback.map(async (f) => {
        if (!f.userId) {
          return {
            ...f,
            user: null,
          };
        }
        const user = await ctx.db.get(f.userId);
        return {
          ...f,
          user: user ? {
            name: user.name,
            email: user.email,
            image: user.image,
          } : null,
        };
      })
    );
  },
});

export const updateFeedbackStatus = mutation({
  args: {
    id: v.id("feedback"),
    status: v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: You must be logged in to submit feedback.");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) {
      throw new Error("User not found in database.");
    }
    if (!user.isAdmin) {
      throw new Error("Unauthorized: You must be an admin to update feedback status.");
    }
    await ctx.db.patch(args.id, { status: args.status });
  },
});
