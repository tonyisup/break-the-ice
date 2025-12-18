import { mutation } from "./_generated/server";
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
