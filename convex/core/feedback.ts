import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const submitFeedback = mutation({
	args: {
		text: v.string(),
		pageUrl: v.string(),
		sessionId: v.optional(v.string()),
	},
	returns: v.null(),
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
			// Use composite index for efficient rate-limiting query
			recentFeedback = await ctx.db
				.query("feedback")
				.withIndex("by_userId", (q) =>
					q.eq("userId", userId).gt("_creationTime", oneHourAgo)
				)
				.collect();
		} else if (args.sessionId) {
			// Use composite index for efficient rate-limiting query
			recentFeedback = await ctx.db
				.query("feedback")
				.withIndex("by_sessionId", (q) =>
					q.eq("sessionId", args.sessionId).gt("_creationTime", oneHourAgo)
				)
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
			status: "new",
		});

		return null;
	},
});
