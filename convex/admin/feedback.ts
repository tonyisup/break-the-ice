import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureAdmin } from "../auth";

export const getFeedback = query({
	args: {},
	handler: async (ctx) => {
		await ensureAdmin(ctx);
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
		await ensureAdmin(ctx);
		await ctx.db.patch(args.id, { status: args.status });
	},
});
