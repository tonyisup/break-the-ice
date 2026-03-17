"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";
import { extractQuiverSvg } from "../../src/lib/quiver-svg";

const QUIVER_TIMEOUT_MS = 10_000;

export const startDuplicateDetection = action({
	args: {
		threshold: v.optional(v.number()),
	},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx, args): Promise<Id<"duplicateDetectionProgress">> => {
		await ensureAdmin(ctx);
		return await ctx.runAction(internal.internal.ai.detectDuplicateQuestionsStreaming, {
			threshold: args.threshold,
		}) as Id<"duplicateDetectionProgress">;
	},
});

export const generateQuestionImage = action({
	args: {
		questionText: v.string(),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		await ensureAdmin(ctx);

		const apiKey = process.env.QUIVERAI_API_KEY;
		if (!apiKey) {
			throw new Error("QUIVERAI_API_KEY is not configured");
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), QUIVER_TIMEOUT_MS);

		let response: Response;
		try {
			response = await fetch("https://api.quiver.ai/v1/svgs/generations", {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "arrow-preview",
					prompt: args.questionText,
					n: 1,
					stream: false,
				}),
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(`QuiverAI API request timed out after ${QUIVER_TIMEOUT_MS}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(`QuiverAI API error: ${response.statusText} ${JSON.stringify(errorData)}`);
		}

		const data = await response.json();
		const svg = extractQuiverSvg(data);
		if (!svg) {
			throw new Error(`QuiverAI API returned no SVG payload: ${JSON.stringify(data)}`);
		}

		return svg;
	},
});

export const generateAIQuestions = action({
	args: {
		count: v.optional(v.number()),
		selectedTags: v.array(v.string()),
		currentQuestion: v.optional(v.string()),
		excludedQuestions: v.optional(v.array(v.string())),
		styleId: v.optional(v.id("styles")),
		style: v.optional(v.string()),
		toneId: v.optional(v.id("tones")),
		tone: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
		topic: v.optional(v.string()),
		blueprintSlug: v.optional(v.string()),
	},
	returns: v.object({
		text: v.string(),
		runId: v.id("generationRuns"),
	}),
	handler: async (ctx, args): Promise<{ text: string; runId: Id<"generationRuns"> }> => {
		await ensureAdmin(ctx);
		const count = args.count ?? 1;
		const preview = await runPreviewQuestionGeneration(ctx, {
			styleId: args.styleId,
			styleSlug: args.style,
			toneId: args.toneId,
			toneSlug: args.tone,
			topicId: args.topicId,
			topicSlug: args.topic,
			blueprintSlug: args.blueprintSlug,
			excludedQuestions: args.excludedQuestions,
			currentQuestion: args.currentQuestion,
			userContext: args.selectedTags.length > 0 ? `Preferred tags: ${args.selectedTags.join(", ")}` : undefined,
			batchSize: count,
		});

		if (!preview.previewText.trim()) {
			throw new Error("No preview question generated");
		}

		return {
			text: preview.previewText,
			runId: preview.runId,
		};
	},
});
