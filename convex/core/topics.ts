import { v } from "convex/values";
import { query } from "../_generated/server";

export const getTopics = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const topics = await ctx.db
			.query("topics")
			.withIndex("by_order")
			.collect();

		if (args.organizationId) {
			return topics.filter(t => t.organizationId === args.organizationId);
		}
		return topics;
	},
});

export const getTopic = query({
	args: {
		id: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("topics")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();
	},
});

// Query to get topic by system ID
export const getTopicBySystemId = query({
	args: {
		id: v.id("topics"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});
