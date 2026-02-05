import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const addTopicEmbedding = internalMutation({
	args: {
		topicId: v.id("topics"),
		embedding: v.array(v.float64()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.topicId, {
			embedding: args.embedding,
		});
	},
});

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
		embedding: v.optional(v.array(v.number())),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	})),
	handler: async (ctx) => {
		const now = Date.now();
		return await ctx.db
			.query("topics")
			.withIndex("by_startDate_endDate_order", (t) =>
				t.lt("startDate", now)
			)
			.filter((q) => q.gt(q.field("endDate"), now))
			.order("asc")
			.first();
	},
});