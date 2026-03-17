"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";

function looksLikeSvgMarkup(value: string): boolean {
	return value.trim().startsWith("<svg") || value.trim().startsWith("<?xml");
}

function extractQuiverSvg(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (looksLikeSvgMarkup(trimmed)) return trimmed;
		try {
			return extractQuiverSvg(JSON.parse(trimmed));
		} catch {
			return null;
		}
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			const svg = extractQuiverSvg(entry);
			if (svg) return svg;
		}
		return null;
	}

	if (value && typeof value === "object") {
		const objectValue = value as Record<string, unknown>;
		if (typeof objectValue.svg === "string" && looksLikeSvgMarkup(objectValue.svg)) {
			return objectValue.svg;
		}
		if (typeof objectValue.data === "string" && looksLikeSvgMarkup(objectValue.data)) {
			return objectValue.data;
		}
		if (objectValue.data) {
			const svg = extractQuiverSvg(objectValue.data);
			if (svg) return svg;
		}
		if (objectValue.generations) {
			return extractQuiverSvg(objectValue.generations);
		}
	}

	return null;
}

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

		const response = await fetch("https://api.quiver.ai/v1/svgs/generations", {
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
		});

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
