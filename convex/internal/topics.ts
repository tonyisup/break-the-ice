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
	handler: async (ctx) => {
		const now = Date.now();
		return await ctx.db
			.query("topics")
			.withIndex("by_startDate_endDate_order", (t) =>
				t.lt("startDate", now)
			)
			.filter((q) => q.gt(q.field("endDate"), now))
			.order("asc")
			.first()
	},
});