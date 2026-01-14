import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submitFeedback = mutation({
  args: {
    text: v.string(),
    pageUrl: v.string(),
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

    await ctx.db.insert("feedback", {
      text: args.text,
      pageUrl: args.pageUrl,
      userId: user._id,
      createdAt: Date.now(),
      status: "new",
    });
  },
});

export const getFeedback = query({
  args: {},
  handler: async (ctx) => {
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    return await Promise.all(
      feedback.map(async (f) => {
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
    await ctx.db.patch(args.id, { status: args.status });
  },
});
