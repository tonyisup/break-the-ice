import { v } from "convex/values";
import { query } from "../_generated/server";

const publicTopicFields = {
	_id: v.id("topics"),
	_creationTime: v.number(),
	id: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	order: v.optional(v.float64()),
	organizationId: v.optional(v.id("organizations")),
};

export const getTopics = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.object(publicTopicFields)),
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
	returns: v.union(v.object(publicTopicFields), v.null()),
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
	returns: v.union(v.object(publicTopicFields), v.null()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});
