import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const makeAdmin = mutation({
	args: {
		email: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.patch(user._id, { isAdmin: true });
		return null;
	},
});

export const updateUser = mutation({
	args: {
		userId: v.id("users"),
		aiUsageCount: v.optional(v.number()),
		newsletterSubscriptionStatus: v.optional(
			v.union(v.literal("subscribed"), v.literal("unsubscribed"))
		),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { userId, aiUsageCount, newsletterSubscriptionStatus } = args;

		const user = await ctx.db.get(userId);
		if (!user) throw new Error("User not found");

		const updates: {
			aiUsage?: { count: number; cycleStart: number };
			newsletterSubscriptionStatus?: "subscribed" | "unsubscribed";
		} = {};

		if (aiUsageCount !== undefined) {
			updates.aiUsage = {
				...(user.aiUsage ?? { cycleStart: Date.now() }),
				count: aiUsageCount,
			};
		}

		if (newsletterSubscriptionStatus !== undefined) {
			updates.newsletterSubscriptionStatus = newsletterSubscriptionStatus;
		}

		await ctx.db.patch(userId, updates);
	},
});

export const getUsers = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		return await ctx.db
			.query("users")
			.order("desc")
			.collect();
	},
});
