"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { ensureAiRequestAllowed } from "../lib/aiRateLimit";
import { clampBatchSize } from "../lib/promptArchitecture";
import { MAX_FEED_GENERATION_COUNT } from "../constants";

export const generateAIQuestionForFeed = action({
	args: {
		count: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		anchoredStyleId: v.optional(v.id("styles")),
		anchoredToneId: v.optional(v.id("tones")),
		anchoredTopicId: v.optional(v.id("topics")),
	},
	returns: v.array(v.nullable(v.any())),
	handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
		if (args.organizationId) {
			const organizations = await ctx.runQuery(api.core.organizations.getOrganizations, {});
			const isMember = organizations.some((organization: { _id: Id<"organizations"> }) => organization._id === args.organizationId);

			if (!isMember) {
				throw new Error("Not a member of this organization.");
			}
		}

		const user = await ctx.runQuery(api.core.users.getCurrentUser, {
			organizationId: args.organizationId,
		});

		if (!user) {
			throw new Error("You must be logged in to generate AI questions.");
		}
		await ensureAiRequestAllowed(ctx);

		// A request is charged to the person's plan at most once, however many questions it asks for.
		const count = Math.min(clampBatchSize(args.count ?? 1), MAX_FEED_GENERATION_COUNT);
		const takeoverTopics = await ctx.runQuery(api.core.topics.getActiveTakeoverTopics);
		let topicId = args.anchoredTopicId;
		let bypassAIUsage = false;
		const hasExplicitAnchor = !!(
			args.anchoredStyleId || args.anchoredToneId || args.anchoredTopicId
		);

		if (!hasExplicitAnchor && takeoverTopics.length > 0) {
			topicId = takeoverTopics[Math.floor(Math.random() * takeoverTopics.length)]._id;
			bypassAIUsage = true;
		}

		return await ctx.runAction(internal.internal.ai.generateAIQuestionForUser, {
			userId: user._id,
			count,
			organizationId: args.organizationId,
			topicId,
			bypassAIUsage,
			anchoredStyleId: args.anchoredStyleId,
			anchoredToneId: args.anchoredToneId,
			purpose: "feed",
		});
	}
});
