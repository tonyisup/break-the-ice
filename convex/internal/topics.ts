import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

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
