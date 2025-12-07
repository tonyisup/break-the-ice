
import { convexTest } from "convex-test";
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.OPEN_ROUTER_API_KEY = "test-key";
process.env.AI_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";

// Mock OpenAI
const mockCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();
vi.mock('openai', () => {
	const mockOpenAI = {
		chat: {
			completions: {
				create: mockCreate,
			},
		},
		embeddings: {
			create: mockEmbeddingsCreate,
		}
	};
	const MockedOpenAI = vi.fn(() => mockOpenAI);
	return { OpenAI: MockedOpenAI, default: MockedOpenAI, __esModule: true };
});

beforeEach(() => {
	mockCreate.mockClear();
	mockEmbeddingsCreate.mockClear();
	mockEmbeddingsCreate.mockResolvedValue({
		data: [{ embedding: new Array(384).fill(0.1) }],
	});
});

test("generate AI question parses numbered list fallback", async () => {
	// Simulate a model returning a numbered list instead of JSON
	mockCreate.mockResolvedValue({
		choices: [{ message: { content: '1. What is your favorite color?\n2. Who is your hero?' } }],
	});

	const t = convexTest(schema);

	// Setup styles and tones
	await t.run(async (ctx) => {
		await ctx.db.insert("styles", {
			name: "Fun",
			description: "Fun style",
			id: "fun",
		});
		await ctx.db.insert("tones", {
			name: "Silly",
			description: "Silly tone",
			id: "silly",
		});
	});

	const result = await t.action(api.ai.generateAIQuestions, {
		count: 2,
		style: "fun",
		tone: "silly"
	});

	expect(result).toBeDefined();
	expect(result.length).toBe(2);
	// @ts-ignore
	expect(result[0].text).toBe("What is your favorite color?");
	// @ts-ignore
	expect(result[0].style).toBe("fun");
	// @ts-ignore
	expect(result[1].text).toBe("Who is your hero?");
});
