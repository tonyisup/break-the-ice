"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { runPreviewQuestionGeneration } from "../lib/generationRunner";
import { extractQuiverSvg } from "../../src/lib/quiver-svg";

const DEFAULT_QUIVER_TIMEOUT_MS = 30_000;
const DEFAULT_QUIVER_MAX_ATTEMPTS = 2;
const MAX_NODE_TIMEOUT_MS = 2_147_483_647;

function parsePositiveInteger(value: string | undefined, fallback: number, maxValue = Number.MAX_SAFE_INTEGER): number {
	const trimmed = value?.trim() ?? "";
	if (!/^\d+$/.test(trimmed)) {
		return fallback;
	}

	const parsed = Number.parseInt(trimmed, 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxValue) : fallback;
}

function getQuiverTimeoutMs(): number {
	return parsePositiveInteger(process.env.QUIVERAI_TIMEOUT_MS, DEFAULT_QUIVER_TIMEOUT_MS, MAX_NODE_TIMEOUT_MS);
}

function getQuiverMaxAttempts(): number {
	return parsePositiveInteger(process.env.QUIVERAI_MAX_ATTEMPTS, DEFAULT_QUIVER_MAX_ATTEMPTS, Number.MAX_SAFE_INTEGER);
}

function shouldRetryQuiverStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function readQuiverError(data: unknown): string {
	return JSON.stringify(data);
}

function createNonRetryableQuiverError(message: string): Error & { nonRetryable: true } {
	const error = new Error(message) as Error & { nonRetryable: true };
	error.nonRetryable = true;
	return error;
}

function isContentStreamEvent(value: unknown): value is { type: "content" } {
	return (
		typeof value === "object"
		&& value !== null
		&& "type" in value
		&& value.type === "content"
	);
}

async function readQuiverSvgStream(
	response: Response,
	resetTimeout: () => void,
): Promise<string> {
	if (!response.body) {
		throw createNonRetryableQuiverError("QuiverAI API returned no stream body");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let dataLines: string[] = [];
	let finalSvg: string | null = null;
	let sawDone = false;

	const flushEvent = (): boolean => {
		if (dataLines.length === 0) {
			return false;
		}

		const data = dataLines.join("\n").trim();
		dataLines = [];
		if (!data) {
			return false;
		}
		if (data === "[DONE]") {
			sawDone = true;
			return true;
		}

		let payload: unknown = data;
		try {
			payload = JSON.parse(data);
		} catch {
			payload = data;
		}

		const svg = extractQuiverSvg(payload);
		if (svg && isContentStreamEvent(payload)) {
			finalSvg = svg;
		}

		return false;
	};

	const processLine = (line: string): boolean => {
		if (line === "") {
			return flushEvent();
		}
		if (line.startsWith(":")) {
			return false;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trimStart());
		}
		return false;
	};

	const processBufferedLines = (): boolean => {
		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex >= 0) {
			let line = buffer.slice(0, newlineIndex);
			if (line.endsWith("\r")) {
				line = line.slice(0, -1);
			}
			buffer = buffer.slice(newlineIndex + 1);
			if (processLine(line)) {
				return true;
			}
			newlineIndex = buffer.indexOf("\n");
		}
		return false;
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			resetTimeout();
			buffer += decoder.decode(value, { stream: true });
			if (processBufferedLines()) {
				await reader.cancel();
				break;
			}
		}

		buffer += decoder.decode();
		if (buffer.length > 0) {
			for (const trailingLine of buffer.split("\n")) {
				let line = trailingLine;
				if (line.endsWith("\r")) {
					line = line.slice(0, -1);
				}
				if (processLine(line)) {
					break;
				}
			}
		}
		flushEvent();
	} finally {
		reader.releaseLock();
	}

	if (!finalSvg) {
		throw createNonRetryableQuiverError(
			`QuiverAI stream contained no final content SVG${sawDone ? "" : " before the connection closed"}`
		);
	}

	return finalSvg;
}

async function requestQuiverSvg(questionText: string, apiKey: string, instructions?: string): Promise<string> {
	const timeoutMs = getQuiverTimeoutMs();
	const maxAttempts = getQuiverMaxAttempts();
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const controller = new AbortController();
		let timeout = setTimeout(() => controller.abort(), timeoutMs);
		const resetTimeout = (): void => {
			clearTimeout(timeout);
			timeout = setTimeout(() => controller.abort(), timeoutMs);
		};

		try {
			const response = await fetch("https://api.quiver.ai/v1/svgs/generations", {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "arrow-preview",
					prompt: questionText,
					...(instructions ? { instructions } : {}),
					n: 1,
					stream: true,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const error = new Error(`QuiverAI API error: ${response.status} ${response.statusText} ${readQuiverError(errorData)}`);

				if (attempt < maxAttempts && shouldRetryQuiverStatus(response.status)) {
					lastError = error;
					await sleep(300 * attempt);
					continue;
				}

				if (!shouldRetryQuiverStatus(response.status)) {
					(error as Error & { nonRetryable?: boolean }).nonRetryable = true;
				}

				throw error;
			}

			const contentType = response.headers.get("content-type") ?? "";
			const svg = contentType.includes("text/event-stream") || (contentType === "" && response.body)
				? await readQuiverSvgStream(response, resetTimeout)
				: extractQuiverSvg(await response.json());
			if (!svg) {
				throw createNonRetryableQuiverError("QuiverAI API returned no SVG payload");
			}

			return svg;
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				lastError = new Error(
					attempt < maxAttempts
						? `QuiverAI API request timed out after ${timeoutMs}ms on attempt ${attempt} of ${maxAttempts}`
						: `QuiverAI API request timed out after ${timeoutMs}ms across ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}`
				);
			} else if (error instanceof Error && (error as Error & { nonRetryable?: boolean }).nonRetryable === true) {
				throw error;
			} else if (error instanceof Error) {
				lastError = error;
			} else {
				lastError = new Error(String(error));
			}

			if (attempt >= maxAttempts) {
				throw lastError;
			}

			await sleep(300 * attempt);
		} finally {
			clearTimeout(timeout);
		}
	}

	throw lastError ?? new Error("QuiverAI request failed");
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
		additionalGuidance: v.optional(v.string()),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		await ensureAdmin(ctx);

		const apiKey = process.env.QUIVERAI_API_KEY;
		if (!apiKey) {
			throw new Error("QUIVERAI_API_KEY is not configured");
		}

		return await requestQuiverSvg(args.questionText, apiKey, args.additionalGuidance);
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
