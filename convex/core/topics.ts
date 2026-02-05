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
const mapToPublicTopic = (topic: any) => ({
	_id: topic._id,
	_creationTime: topic._creationTime,
	id: topic.id,
	name: topic.name,
	description: topic.description,
	order: topic.order,
	organizationId: topic.organizationId,
});

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

		const filtered = args.organizationId
			? topics.filter(t => t.organizationId === args.organizationId)
			: topics;

		return filtered;
	},
});

export const getTopic = query({
	args: {
		id: v.string(),
	},
	returns: v.union(v.object(publicTopicFields), v.null()),
	handler: async (ctx, args) => {
		const topic = await ctx.db
			.query("topics")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();
		return topic ? mapToPublicTopic(topic) : null;
	},
});

// Query to get topic by system ID
export const getTopicBySystemId = query({
	args: {
		id: v.id("topics"),
	},
	returns: v.union(v.object(publicTopicFields), v.null()),
	handler: async (ctx, args) => {
		const topic = await ctx.db.get(args.id);
		return topic;
	},
});
