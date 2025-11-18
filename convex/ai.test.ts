import { convexTest } from "convex-test";
import { expect, test, vi, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

process.env.OPEN_ROUTER_API_KEY = "test-key";
process.env.AI_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";

// 1. Mock the OpenAI module
const mockCreate = vi.fn();
vi.mock('openai', () => {
    const mockOpenAI = {
        chat: {
            completions: {
                create: mockCreate,
            },
        },
    };
    // Need to mock both the default export and the named export 'OpenAI'
    const MockedOpenAI = vi.fn(() => mockOpenAI);
    return { OpenAI: MockedOpenAI, default: MockedOpenAI, __esModule: true };
});

beforeEach(() => {
  mockCreate.mockClear();
});


test("generate AI question with existing questions", async () => {
  // Reset mock implementation for this specific test
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: '["This is a new AI question 1", "This is a new AI question 2"]' } }],
  });

  const t = convexTest(schema);

  // 2. Setup: Populate the database with some initial data
  await t.run(async (ctx) => {
    // Insert a style
    await ctx.db.insert("styles", {
      name: "Test Style",
      structure: "Test Structure",
      promptGuidanceForAI: "Test Guidance",
      id: "test-style",
      color: "blue",
      icon: "test-icon",
    });

    // Insert a tone
    await ctx.db.insert("tones", {
        name: "Test Tone",
        promptGuidanceForAI: "Test Guidance",
        id: "test-tone",
        color: "red",
        icon: "test-icon",
    });

    // Insert some questions
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert("questions", {
        text: `Existing question ${i}`,
        style: "test-style",
        tone: "test-tone",
        isAIGenerated: false,
        totalLikes: 0,
        totalThumbsDown: 0,
        totalShows: 0,
        averageViewDuration: 0,
        lastShownAt: Date.now()
      });
    }
  });


  // 3. Run the action
  const result = await t.action(api.ai.generateAIQuestion, {
    selectedTags: [],
    style: "test-style",
    tone: "test-tone",
    count: 2,
    _existingQuestionsForTesting: [
      "Existing question 0",
      "Existing question 1",
      "Existing question 2",
      "Existing question 3",
      "Existing question 4",
    ],
  });

  // 4. Assert the result
  expect(result).toBeDefined();
  expect(result.length).toBe(2);
  if (result[0]) {
    expect(result[0].text).toBe("This is a new AI question 1");
  }
  if (result[1]) {
    expect(result[1].text).toBe("This is a new AI question 2");
  }


  // 5. Assert that the mock was called correctly
  const calls = mockCreate.mock.calls;
  expect(calls.length).toBe(1);
  
  const messages = calls[0][0].messages;
  expect(messages.length).toBe(2);
  expect(messages[0].role).toBe("system");
  expect(messages[0].content).toContain("Return exactly 2 question(s)");

  expect(messages[1].role).toBe("user");
  expect(messages[1].content).toContain("Generate 2 ice-breaker question(s) with these parameters:");
  expect(messages[1].content).toContain('"style": "Test Style"');
  expect(messages[1].content).toContain('"structure": "Test Structure"');
  expect(messages[1].content).toContain('"tone": "Test Tone"');
  expect(messages[1].content).toContain('"toneGuidance": "Test Guidance"');
  expect(messages[1].content).toContain('"styleGuidance": "Test Guidance"');
  expect(messages[1].content).toContain('"Existing question 0"');
  expect(messages[1].content).toContain('"Existing question 1"');
  expect(messages[1].content).toContain('"Existing question 2"');
  expect(messages[1].content).toContain('"Existing question 3"');
  expect(messages[1].content).toContain('"Existing question 4"');
  expect(messages[1].content).toContain('"count": 2');
});
