/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import schema from "./schema";

const originalFetch = global.fetch;
const originalApiKey = process.env.QUIVERAI_API_KEY;
const originalTimeout = process.env.QUIVERAI_TIMEOUT_MS;
const originalMaxAttempts = process.env.QUIVERAI_MAX_ATTEMPTS;

function createAbortError(): Error {
	const error = new Error("The operation was aborted");
	error.name = "AbortError";
	return error;
}

function restoreEnvVar(key: "QUIVERAI_API_KEY" | "QUIVERAI_TIMEOUT_MS" | "QUIVERAI_MAX_ATTEMPTS", value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}

	process.env[key] = value;
}

function createSseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();

	return new Response(new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	}), {
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}

describe("admin ai image generation", () => {
	beforeEach(() => {
		process.env.QUIVERAI_API_KEY = "test-quiver-key";
		delete process.env.QUIVERAI_TIMEOUT_MS;
		delete process.env.QUIVERAI_MAX_ATTEMPTS;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		restoreEnvVar("QUIVERAI_API_KEY", originalApiKey);
		restoreEnvVar("QUIVERAI_TIMEOUT_MS", originalTimeout);
		restoreEnvVar("QUIVERAI_MAX_ATTEMPTS", originalMaxAttempts);
	});

	test("retries once after a timeout and returns the svg", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));
		const mockFetch = vi
			.fn()
			.mockRejectedValueOnce(createAbortError())
			.mockResolvedValueOnce(createSseResponse([
				"event: reasoning\n",
				"data: {\"type\":\"reasoning\",\"id\":\"svg-abc123\",\"svg\":\"\",\"text\":\"Sketching a playful penguin...\"}\n\n",
				"event: draft\n",
				"data: {\"type\":\"draft\",\"id\":\"svg-abc123\",\"svg\":\"<svg xmlns=\\\"http://www.w3.org/2000/svg\\\"><circle cx=\\\"12\\\" cy=\\\"12\\\" r=\\\"10\\\"/>\"}\n\n",
				"event: content\n",
				"data: {\"type\":\"content\",\"id\":\"svg-abc123\",\"svg\":\"<svg xmlns=\\\"http://www.w3.org/2000/svg\\\"></svg>\",\"usage\":{\"total_tokens\":100,\"input_tokens\":40,\"output_tokens\":60}}\n\n",
				"data: [DONE]\n\n",
			]));
		global.fetch = mockFetch as typeof fetch;

		const svg = await t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
			questionText: "Draw a penguin holding coffee",
			additionalGuidance: "Use a flat monochrome style with clean geometry.",
		});

		expect(svg).toBe("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body))).toMatchObject({
			model: "arrow-preview",
			n: 1,
			prompt: "Draw a penguin holding coffee",
			instructions: "Use a flat monochrome style with clean geometry.",
			stream: true,
		});
	});

	test("surfaces the configured timeout after exhausting retries", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));
		process.env.QUIVERAI_TIMEOUT_MS = "1500";
		process.env.QUIVERAI_MAX_ATTEMPTS = "1";

		const mockFetch = vi.fn().mockRejectedValue(createAbortError());
		global.fetch = mockFetch as typeof fetch;

		await expect(
			t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
				questionText: "Draw a penguin holding coffee",
			})
		).rejects.toThrow("QuiverAI API request timed out after 1500ms across 1 attempt");

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("does not retry non-retryable upstream errors", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));
		process.env.QUIVERAI_MAX_ATTEMPTS = "2";

		const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "bad prompt" }), {
			status: 400,
			statusText: "Bad Request",
			headers: {
				"Content-Type": "application/json",
			},
		}));
		global.fetch = mockFetch as typeof fetch;

		await expect(
			t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
				questionText: "Draw a penguin holding coffee",
			})
		).rejects.toThrow("QuiverAI API error: 400 Bad Request");

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("falls back to the default timeout when the env value is not a whole number", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));
		process.env.QUIVERAI_TIMEOUT_MS = "1500ms";
		process.env.QUIVERAI_MAX_ATTEMPTS = "1";

		const mockFetch = vi.fn().mockRejectedValue(createAbortError());
		global.fetch = mockFetch as typeof fetch;

		await expect(
			t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
				questionText: "Draw a penguin holding coffee",
			})
		).rejects.toThrow("QuiverAI API request timed out after 30000ms across 1 attempt");

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("clamps oversized timeout env values to the Node timer maximum", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));
		process.env.QUIVERAI_TIMEOUT_MS = "999999999999999999999";
		process.env.QUIVERAI_MAX_ATTEMPTS = "1";

		const mockFetch = vi.fn().mockRejectedValue(createAbortError());
		global.fetch = mockFetch as typeof fetch;

		await expect(
			t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
				questionText: "Draw a penguin holding coffee",
			})
		).rejects.toThrow("QuiverAI API request timed out after 2147483647ms across 1 attempt");

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("rejects a stream that never emits a final content svg", async () => {
		const t = convexTest(schema, import.meta.glob("./**/*.ts"));

		const mockFetch = vi.fn().mockResolvedValue(createSseResponse([
			"event: reasoning\n",
			"data: {\"type\":\"reasoning\",\"id\":\"svg-abc123\",\"svg\":\"\",\"text\":\"Thinking...\"}\n\n",
			"event: draft\n",
			"data: {\"type\":\"draft\",\"id\":\"svg-abc123\",\"svg\":\"<svg xmlns=\\\"http://www.w3.org/2000/svg\\\"></svg>\"}\n\n",
			"data: [DONE]\n\n",
		]));
		global.fetch = mockFetch as typeof fetch;

		await expect(
			t.withIdentity({ metadata: { isAdmin: "true" } }).action(api.admin.ai.generateQuestionImage, {
				questionText: "Draw a penguin holding coffee",
			})
		).rejects.toThrow("QuiverAI stream contained no final content SVG");

		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
