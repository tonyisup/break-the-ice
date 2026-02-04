import { mutation, query } from "../_generated/server";
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
