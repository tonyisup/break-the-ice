import { Doc } from "./_generated/dataModel";
import { MutationCtx, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper to ensure user exists
export async function getUserOrCreate(ctx: MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Not authenticated");
	}

	const user = await ctx.db
		.query("users")
		.withIndex("email", (q) => q.eq("email", identity.email))
		.unique();

	if (user) {
		return user;
	}

	const userId = await ctx.db.insert("users", {
		name: identity.name!,
		email: identity.email,
		image: identity.pictureUrl,
	});

	return (await ctx.db.get(userId))!;
}

export const getUserById = internalQuery({
	args: { id: v.id("users") },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getUserByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();
	},
});

export const getCurrentUser = query({
	args: {},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx): Promise<Doc<"users"> | null> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		return user;
	},
});

export const updateUserFromClerk = internalMutation({
	args: {
		clerkId: v.string(),
		email: v.optional(v.string()),
		name: v.string(),
		image: v.optional(v.string()),
		subscriptionTier: v.union(v.literal("free"), v.literal("casual")),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (user) {
			await ctx.db.patch(user._id, {
				name: args.name,
				image: args.image,
				subscriptionTier: args.subscriptionTier,
			});
		} else if (args.email) {
			await ctx.db.insert("users", {
				name: args.name,
				email: args.email,
				image: args.image,
				subscriptionTier: args.subscriptionTier,
				aiUsage: { count: 0, cycleStart: Date.now() },
			});
		}
	},
});

export const setNewsletterStatus = internalMutation({
	args: {
		email: v.string(),
		status: v.union(v.literal("subscribed"), v.literal("unsubscribed")),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.unique();

		if (user) {
			await ctx.db.patch(user._id, {
				newsletterSubscriptionStatus: args.status,
			});
		}
	},
});

export const checkAndIncrementAIUsage = internalMutation({
	args: {
		userId: v.id("users"),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error("User not found");

		const now = Date.now();
		const cycleLength = 30 * 24 * 60 * 60 * 1000; // 30 days
		let aiUsage = user.aiUsage || { count: 0, cycleStart: now };

		// Reset cycle if needed
		if (now - aiUsage.cycleStart > cycleLength) {
			aiUsage = { count: 0, cycleStart: now };
		}
		const limit = user.subscriptionTier === "casual" ? parseInt(process.env.MAX_CASUAL_AIGEN ?? "100") : parseInt(process.env.MAX_FREE_AIGEN ?? "10");

		const remaining = limit - aiUsage.count;
		if (remaining <= 0) {
			throw new Error(`AI generation limit reached. You have used ${aiUsage.count}/${limit} generations this cycle.`);
		}

		const actualCount = Math.min(1, remaining);

		await ctx.db.patch(user._id, {
			aiUsage: {
				count: aiUsage.count + actualCount,
				cycleStart: aiUsage.cycleStart,
			},
		});

		return actualCount;
	},
});

export const store = mutation({
	args: {},
	returns: v.id("users"),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called storeUser without authentication present");
		}

		// Check if we've already stored this identity before.
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (user !== null) {
			// If we've seen this identity before but the name has changed, patch the value.
			if (user.name !== identity.name) {
				await ctx.db.patch(user._id, { name: identity.name });
			}
			return user._id;
		}

		// If it's a new identity, create a new user.
		return await ctx.db.insert("users", {
			name: identity.name!,
			email: identity.email,
			image: identity.pictureUrl,
		});
	},
});
