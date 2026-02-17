import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { getActiveTakeoverTopicsHelper } from "../lib/takeover";

export const addTopicEmbedding = internalMutation({
	args: {
		topicId: v.id("topics"),
		embedding: v.array(v.float64()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("topic_embeddings")
			.withIndex("by_topicId", (q) => q.eq("topicId", args.topicId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { embedding: args.embedding });
		} else {
			await ctx.db.insert("topic_embeddings", {
				topicId: args.topicId,
				embedding: args.embedding,
			});
		}
	},
});

export const getTopicBySystemId = internalQuery({
	args: { id: v.id("topics") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getTopicById = getTopicBySystemId;

export const getTopCurrentTopic = internalQuery({
	args: {},
	returns: v.nullable(v.object({
		_id: v.id("topics"),
		_creationTime: v.number(),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		takeoverStartDate: v.optional(v.number()),
		takeoverEndDate: v.optional(v.number()),
	})),
	handler: async (ctx) => {
		const now = Date.now();
		return await ctx.db
			.query("topics")
			.withIndex("by_startDate_endDate_order", (t) =>
				t.lt("startDate", now)
			)
			.filter((q) => q.or(
				q.eq(q.field("endDate"), undefined),
				q.gt(q.field("endDate"), now)
			))
			.order("asc")
			.first();
	},
});

export const getActiveTakeoverTopicsInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await getActiveTakeoverTopicsHelper(ctx);
	},
});