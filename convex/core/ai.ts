"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { runPersistedQuestionGeneration, runPreviewQuestionGeneration } from "../lib/generationRunner";

export const preview = action({
	args: {
		count: v.optional(v.number()),
		style: v.string(),
		tone: v.string(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<Doc<"questions">[]> => {
		return await ctx.runQuery(api.core.questions.getSimilarQuestions, {
			count: args.count ?? 5,
			style: args.style,
			tone: args.tone,
		});
	},
});

export const generateFallbackQuestion = action({
	args: {},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx): Promise<Doc<"questions"> | null> => {
		const randomStyle = await ctx.runQuery(api.core.styles.getRandomStyle, {});
		const randomTone = await ctx.runQuery(api.core.tones.getRandomTone, {});
		const result = await runPersistedQuestionGeneration(ctx, {
			purpose: "feed",
			styleId: randomStyle._id,
			toneId: randomTone._id,
			batchSize: 1,
		});
		return (result.questions[0] as Doc<"questions"> | undefined) ?? null;
	},
});

export const generateAIQuestions = action({
	args: {
		count: v.number(),
		selectedTags: v.array(v.string()),
		currentQuestion: v.optional(v.string()),
		excludedQuestions: v.optional(v.array(v.string())),
		styleId: v.optional(v.id("styles")),
		style: v.optional(v.string()),
		toneId: v.optional(v.id("tones")),
		tone: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
		topic: v.optional(v.string()),
	},
	returns: v.object({
		text: v.string(),
		runId: v.id("generationRuns"),
	}),
	handler: async (ctx, args): Promise<{ text: string; runId: Id<"generationRuns"> }> => {
		const user = await ctx.runQuery(api.core.users.getCurrentUser, {});
		if (!user) {
			throw new Error("You must be logged in to generate AI questions.");
		}

		const preview = await runPreviewQuestionGeneration(ctx, {
			requestedByUserId: user._id.toString(),
			styleId: args.styleId,
			styleSlug: args.style,
			toneId: args.toneId,
			toneSlug: args.tone,
			topicId: args.topicId,
			topicSlug: args.topic,
			excludedQuestions: args.excludedQuestions,
			currentQuestion: args.currentQuestion,
			userContext: args.selectedTags.length > 0 ? `Preferred tags: ${args.selectedTags.join(", ")}` : undefined,
		});

		return {
			text: preview.previewText,
			runId: preview.runId,
		};
	},
});

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
		const user = await ctx.runQuery(api.core.users.getCurrentUser, {
			organizationId: args.organizationId,
		});

		if (!user) {
			throw new Error("You must be logged in to generate AI questions.");
		}

		const count = args.count || 1;
		const takeoverTopics = await ctx.runQuery(api.core.topics.getActiveTakeoverTopics);
		let topicId = args.anchoredTopicId;
		let bypassAIUsage = false;

		if (takeoverTopics.length > 0) {
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

export const generateAIQuestionForNewsletter = action({
	args: {
		count: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
		const user = await ctx.runQuery(api.core.users.getCurrentUser, {});
		if (!user) {
			throw new Error("You must be logged in to generate newsletter questions.");
		}
		const count = args.count || 1;
		return await ctx.runAction(internal.internal.ai.generateAIQuestionForUser, {
			userId: user._id,
			count,
			purpose: "newsletter",
		});
	}
});
