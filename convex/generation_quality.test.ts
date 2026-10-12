/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import OpenAI, { APIError } from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexErrorData } from "./lib/errorData";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "./lib/promptArchitecture";
import { BRIEF_SYSTEM_PROMPT } from "./lib/brief";
import { openRouterClient } from "./lib/generationRunner";
import { spendDay } from "./lib/aiSpend";

const ADMIN = { subject: "admin-clerk", tokenIdentifier: "test|admin-clerk", metadata: { isAdmin: "true" } };

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  create = vi.spyOn(openRouterClient.chat.completions, "create");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function completion(content: string, finishReason = "stop") {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    created: 0,
    model: "anthropic/claude-haiku-5",
    choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content } }],
    usage: { cost: 0.01 },
  };
}

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const questionsJson = (...texts: string[]) => JSON.stringify({ questions: texts.map((text) => ({ text })) });

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    // v1 is a legacy row (only the old `id`, no examples); v2 is the active version.
    const styleV1 = await ctx.db.insert("styles", {
      id: "reflective",
      name: "Reflective v1",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
      status: "archived",
    });
    const styleV2 = await ctx.db.insert("styles", {
      id: "reflective",
      slug: "reflective",
      name: "Reflective v2",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
      status: "active",
      version: 2,
      examples: [{ text: "What small win are you proud of this week?" }],
    });
    const toneId = await ctx.db.insert("tones", {
      id: "warm",
      slug: "warm",
      name: "Warm",
      promptGuidanceForAI: "Be warm",
      color: "#222222",
      icon: "sun",
      status: "active",
      version: 1,
    });
    return { styleV1, styleV2, toneId };
  });
  return { t, ...ids };
}

describe("prompts use the active style, tone and topic", () => {
  test("an old version's id builds the prompt from the active version's line, and the examples come from the library, not the style", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(styleV1, { brief: "The retired wording." });
      await ctx.db.patch(styleV2, { brief: "Looks back on something small." });
      await ctx.db.patch(toneId, { brief: "Kind and unhurried." });
    });

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, {
      styleId: styleV1,
      toneId,
      batchSize: 1,
    });

    expect(prompt.style._id).toBe(styleV2);
    expect(prompt.style.version).toBe(2);
    expect(prompt.systemPrompt).toBe(BRIEF_SYSTEM_PROMPT);
    // The library holds no questions yet, so none are shown: the example written on the style
    // row belonged to the old prompt.
    expect(prompt.userPrompt).toBe(
      [
        "Style: Reflective v2. Looks back on something small.",
        "Tone: Warm. Kind and unhurried.",
        "",
        "Write 1 new question for this style and tone.",
        'Return JSON only, in this shape: {"questions":[{"text":"...?"}]}',
      ].join("\n"),
    );
  });

  test("an entry with no active version can't build a prompt", async () => {
    const { t, styleV2, toneId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(styleV2, { status: "archived" });
    });

    await expect(
      t.query(internal.internal.generation.buildGenerationPrompt, { styleId: styleV2, toneId, batchSize: 1 }),
    ).rejects.toThrow(/No active styles entry found for slug "reflective"/);
  });

  test("a slug also finds legacy rows that only have the old id", async () => {
    const { t, toneId } = await setup();
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("styles", { id: "legacy-only", name: "Legacy", structure: "x", color: "#333333", icon: "star" }),
    );

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, {
      styleSlug: "legacy-only",
      toneId,
      batchSize: 1,
    });

    expect(prompt.style._id).toBe(legacyId);
  });

  test("remix resolves a question's stored style to its active version", async () => {
    const { t, styleV1, styleV2 } = await setup();

    const active = await t.query(internal.internal.generation.getActiveTaxonomyById, { table: "styles", id: styleV1 });
    expect(active?._id).toBe(styleV2);

    await t.run(async (ctx) => {
      await ctx.db.patch(styleV2, { status: "archived" });
    });
    expect(await t.query(internal.internal.generation.getActiveTaxonomyById, { table: "styles", id: styleV1 })).toBeNull();
  });
});

describe("admin edits keep the prompt fields the form doesn't send", () => {
  test("editing an active style keeps its examples on the new draft version", async () => {
    const { t, styleV2 } = await setup();

    await t.withIdentity(ADMIN).mutation(api.admin.styles.updateStyle, {
      _id: styleV2,
      id: "reflective",
      name: "Reflective v3",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
    });

    const draft = await t.run(async (ctx) =>
      (await ctx.db.query("styles").withIndex("by_slug", (q) => q.eq("slug", "reflective")).collect()).find(
        (style) => style.status === "draft",
      ),
    );
    expect(draft?.name).toBe("Reflective v3");
    expect(draft?.examples).toEqual([{ text: "What small win are you proud of this week?" }]);
  });
});

describe("prompt context", () => {
  test("generation no longer tells the model what questions the user likes", async () => {
    const { t, styleV2, toneId } = await setup();
    const vector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      await ctx.db.insert("user_embeddings", { userId, embedding: vector });
      const likedId = await ctx.db.insert("questions", { text: "Which liked question is nearest?", status: "approved", ...counters });
      await ctx.db.insert("question_embeddings", { questionId: likedId, embedding: vector, status: "approved" });
      return userId;
    });
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);

    await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });

    const prompt = JSON.stringify(create.mock.calls[0][0]);
    expect(prompt).not.toContain("User likes");
    expect(prompt).not.toContain("Which liked question is nearest?");
  });

  test("a personal question the user saw or hid is avoided by its custom text", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
      for (const [status, customText] of [
        ["seen", "What should our team be called?"],
        ["hidden", "Who would you trust with your passwords?"],
      ] as const) {
        const questionId = await ctx.db.insert("questions", { authorId: userId, customText, status: "private", ...counters });
        await ctx.db.insert("userQuestions", { userId, questionId, status, updatedAt: 1 });
      }
      return userId;
    });
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);

    await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });

    const prompt = JSON.stringify(create.mock.calls[0][0]);
    expect(prompt).toContain("What should our team be called?");
    expect(prompt).toContain("Who would you trust with your passwords?");
  });
});

describe("new feed, daily-email and nightly-pool questions wait for review", () => {
  async function generateForReader(t: Awaited<ReturnType<typeof setup>>["t"], styleId: string, toneId: string) {
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" }));
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);
    const questions = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleId as never,
      anchoredToneId: toneId as never,
    });
    return { userId, questions };
  }

  test("the reader gets the question, anyone with the link can open it, and it is held for review", async () => {
    const { t, styleV2, toneId } = await setup();

    const { questions } = await generateForReader(t, styleV2, toneId);

    expect(questions.map((q) => q?.text)).toEqual(["What made you laugh this week?"]);
    const id = questions[0]!._id;
    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored?.status).toBe("pending");
    expect(stored?.isAIGenerated).toBe(true);

    // Signed out, e.g. opened from the daily email.
    expect((await t.query(api.core.questions.getQuestionById, { id }))?._id).toBe(id);

    const queue = await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((q: { _id: string }) => q._id)).toEqual([id]);
  });

  test("a held question is not listed for anyone else until it is approved", async () => {
    const { t, styleV2, toneId } = await setup();
    const { questions } = await generateForReader(t, styleV2, toneId);
    const id = questions[0]!._id;

    const listed = async () => ({
      library: (await t.query(api.core.questions.getPublicQuestions, {})).map((q) => q._id),
      feed: (
        await t.query(internal.internal.questions.getRandomQuestionsInternal, {
          count: 10,
          seen: [],
          hidden: [],
          hiddenStyles: [],
          hiddenTones: [],
        })
      ).map((q: { _id: string }) => q._id),
    });

    expect(await listed()).toEqual({ library: [], feed: [] });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { status: "public" });
    });
    const after = await listed();
    expect(after.library).toContain(id);
    expect(after.feed).toContain(id);
  });

  test("a rejected AI question can no longer be opened", async () => {
    const { t, styleV2, toneId } = await setup();
    const { questions } = await generateForReader(t, styleV2, toneId);
    const id = questions[0]!._id;

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { status: "private" });
    });

    expect(await t.query(api.core.questions.getQuestionById, { id })).toBeNull();
  });

  test("the nightly pool saves its questions held for review too, each marked available for the pool's date", async () => {
    const { t } = await setup();
    // The pool only runs when a daily-email subscriber is close to running out of unseen questions.
    await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk", newsletterSubscriptionStatus: "subscribed" }),
    );
    create.mockResolvedValue(completion(questionsJson("What song is stuck in your head?")) as never);

    const result = await t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 1, maxCombinations: 1 });

    expect(result.errors).toEqual([]);
    expect(result.questionsGenerated).toBe(1);
    const saved = await t.run(async (ctx) => ctx.db.query("questions").collect());
    expect(saved.map((q) => [q.status, q.heldForReview, q.poolStatus])).toEqual([["pending", true, "available"]]);
    expect(saved[0].poolDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // It waits in the admin's queue, and no shared list shows it.
    const queue = await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((q: { _id: string }) => q._id)).toEqual([saved[0]._id]);
    expect(await t.query(api.core.questions.getPublicQuestions, {})).toEqual([]);
  });
});

describe("an empty or unreadable answer gets one retry", () => {
  async function generate(t: Awaited<ReturnType<typeof setup>>["t"], styleId: string, toneId: string, count = 1) {
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" }));
    return await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      count,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleId as never,
      anchoredToneId: toneId as never,
    });
  }
  const runs = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
    t.run(async (ctx) => (await ctx.db.query("generationRuns").collect()).map((run) => [run.status, run.error ?? null]));

  test.each([
    ["an empty answer", completion("")],
    ["an answer that isn't JSON", completion("Sure! Here are some questions: ...")],
    ["JSON with no questions", completion(JSON.stringify({ questions: [] }))],
    ["JSON without a questions array", completion(JSON.stringify({ items: ["What made you laugh this week?"] }))],
  ])("%s is retried once, on a new run", async (_label, bad) => {
    const { t, styleV2, toneId } = await setup();
    create.mockResolvedValueOnce(bad as never).mockResolvedValueOnce(completion(questionsJson("What made you laugh this week?")) as never);

    const questions = await generate(t, styleV2, toneId);

    expect(create).toHaveBeenCalledTimes(2);
    expect(questions.map((q) => q?.text)).toEqual(["What made you laugh this week?"]);
    const [first, second] = await runs(t);
    expect(first[0]).toBe("failed");
    expect(first[1]).toMatch(/empty completion|could not be read|had no questions/);
    expect(second).toEqual(["succeeded", null]);
  });

  test("two unusable answers in a row fail, keep the raw answer, and aren't tried a third time", async () => {
    const { t, styleV2, toneId } = await setup();
    create.mockResolvedValue(completion("not json at all") as never);

    await expect(generate(t, styleV2, toneId)).rejects.toThrow();

    expect(create).toHaveBeenCalledTimes(2);
    const saved = await t.run(async (ctx) => ctx.db.query("generationRuns").collect());
    expect(saved.map((run) => [run.status, run.rawResponse])).toEqual([
      ["failed", "not json at all"],
      ["failed", "not json at all"],
    ]);
  });

  test("a second JSON object after the first doesn't cost a retry", async () => {
    const { t, styleV2, toneId } = await setup();
    create.mockResolvedValue(
      completion(`${questionsJson("What made you laugh this week?")}\n${questionsJson("Which snack do you always come back to?")}`) as never,
    );

    const questions = await generate(t, styleV2, toneId);

    expect(create).toHaveBeenCalledTimes(1);
    expect(questions.map((q) => q?.text)).toEqual(["What made you laugh this week?"]);
  });

  test("a request the provider rejects (400) is not retried", async () => {
    const { t, styleV2, toneId } = await setup();
    create.mockRejectedValue(APIError.generate(400, undefined, "Provider returned error", {}) as never);

    await expect(generate(t, styleV2, toneId)).rejects.toThrow(/400/);

    expect(create).toHaveBeenCalledTimes(1);
    expect(await runs(t)).toEqual([["failed", "400 Provider returned error"]]);
  });
});

describe("runs record what became of the answer", () => {
  test("a run counts the questions parsed, saved, skipped as duplicates and rejected", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" }));
    create.mockResolvedValue(
      completion(
        questionsJson(
          "What made you laugh this week?",
          "What made you laugh this week?",
          "Too short?",
          "Which snack do you always come back to?",
          "One more question that is past the batch size?",
        ),
      ) as never,
    );

    const questions = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      count: 4,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });

    expect(questions).toHaveLength(2);
    const [run] = await t.run(async (ctx) => ctx.db.query("generationRuns").collect());
    expect(run).toMatchObject({
      status: "succeeded",
      batchSize: 4,
      parsedCount: 4,
      insertedCount: 2,
      duplicateCount: 1,
      rejectedCount: 1,
    });
  });

  test("a run that saves nothing is marked failed, with no retry, and the caller gets no questions", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => {
      const text = "What made you laugh this week?";
      await ctx.db.insert("questions", { text, fingerprint: fingerprintText(text), status: "public", ...counters });
      return ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" });
    });
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?", "Too short?")) as never);

    const questions = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      count: 2,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });

    expect(questions).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
    const [run] = await t.run(async (ctx) => ctx.db.query("generationRuns").collect());
    expect(run).toMatchObject({
      status: "failed",
      error: "No new questions saved: 1 duplicate, 1 rejected",
      parsedCount: 2,
      insertedCount: 0,
      duplicateCount: 1,
      rejectedCount: 1,
    });
    expect(run.rawResponse).toContain("What made you laugh this week?");
  });
});

describe("previews", () => {
  test("an admin preview retries an empty answer once and records how many questions it parsed", async () => {
    const { t, styleV2, toneId } = await setup();
    create
      .mockResolvedValueOnce(completion("") as never)
      .mockResolvedValueOnce(completion(questionsJson("What made you laugh this week?")) as never);

    const preview = await t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, {
      selectedTags: [],
      styleId: styleV2,
      toneId,
    });

    expect(preview.text).toBe("What made you laugh this week?");
    const saved = await t.run(async (ctx) => ctx.db.query("generationRuns").collect());
    expect(saved.map((run) => [run.status, run.parsedCount ?? null])).toEqual([
      ["failed", null],
      ["succeeded", 1],
    ]);
    expect(preview.runId).toBe(saved[1]._id);
  });
});

describe("the daily email's image", () => {
  test("renders for a question held for review, and not once it is rejected", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk" }));
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);
    const [question] = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });
    const id = question!._id;

    // The style has two versions under the same slug; the image uses the active one.
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toMatchObject({
      text: "What made you laugh this week?",
      styleName: "Reflective v2",
      toneName: "Warm",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { status: "private" });
    });
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toBeNull();
  });
});

const READER = { subject: "reader-clerk", tokenIdentifier: "test|reader-clerk", email: "reader@example.com" };
type TestConvex = Awaited<ReturnType<typeof setup>>["t"];

async function insertAiQuestion(t: TestConvex, fields: Record<string, unknown> = {}) {
  return await t.run(async (ctx) =>
    ctx.db.insert("questions", {
      text: "What made you laugh this week?",
      isAIGenerated: true,
      heldForReview: true,
      status: "pending",
      ...counters,
      ...fields,
    }),
  );
}

describe("active versions: scoping and lookups", () => {
  test("an id resolves to the active version in its own organization, never another org's copy", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();
    const orgStyle = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      // Same slug, newer version, active: but it belongs to one organization.
      return await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Gym reflective",
        structure: "Ask a gym reflection",
        color: "#444444",
        icon: "dumbbell",
        status: "active",
        version: 9,
        organizationId: orgId,
      });
    });

    expect((await t.query(internal.internal.generation.getActiveTaxonomyById, { table: "styles", id: styleV1 }))?._id).toBe(styleV2);
    expect((await t.query(internal.internal.generation.getActiveTaxonomyById, { table: "styles", id: orgStyle }))?._id).toBe(orgStyle);
    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, { styleId: styleV1, toneId, batchSize: 1 });
    expect(prompt.style._id).toBe(styleV2);
  });

  test("remix gets no style for a malformed id, an id from another table, or a deleted row", async () => {
    const { t, toneId } = await setup();
    const deletedId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("styles", { id: "gone", slug: "gone", name: "Gone", structure: "x", color: "#555555", icon: "x" });
      await ctx.db.delete(id);
      return id;
    });
    const lookup = (id: string) => t.query(internal.internal.generation.getActiveTaxonomyById, { table: "styles", id });

    expect(await lookup("not-a-real-id")).toBeNull();
    expect(await lookup(toneId)).toBeNull();
    expect(await lookup(deletedId)).toBeNull();
  });

  test("a topic id also builds the prompt from the topic's active version", async () => {
    const { t, styleV2, toneId } = await setup();
    const { topicV1, topicV2 } = await t.run(async (ctx) => ({
      topicV1: await ctx.db.insert("topics", { id: "weekends", name: "Weekends v1", status: "archived" }),
      topicV2: await ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends v2", status: "active", version: 2 }),
    }));

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, {
      styleId: styleV2,
      toneId,
      topicId: topicV1,
      batchSize: 1,
    });

    expect(prompt.topic).toMatchObject({ _id: topicV2, version: 2, name: "Weekends v2" });
  });

  test("a remix is written with the active version of the question's style, and with none once no version is active", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();
    const questionId = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "What is your favorite breakfast?", status: "public", styleId: styleV1, toneId, ...counters }),
    );
    create.mockResolvedValue(completion("Which breakfast could you eat forever?") as never);
    // The style, tone and topic are in the remix's instructions; the question is all it is sent besides.
    const sent = (call: number) => (create.mock.calls[call][0] as { messages: Array<{ content: string }> }).messages.map((message) => message.content);

    await t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId });
    // Neither has a brief or a description here, so each one's line is its name again.
    expect(sent(0)[0]).toContain("\nSTYLE: Reflective v2. Reflective v2\nTONE: Warm. Warm\nTOPIC: Keep the topic of the original text\n");
    expect(sent(0)[1]).toBe('Remix this question: "What is your favorite breakfast?"');

    await t.run(async (ctx) => {
      await ctx.db.patch(styleV2, { status: "archived" });
    });
    await t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId });
    expect(sent(1)[0]).toContain("\nSTYLE: Keep the style of the original text\nTONE: Warm. Warm\n");
    expect(sent(1).join("\n")).not.toContain("Reflective");
  });
});

describe("admin edits keep prompt fields: drafts and tones", () => {
  test("editing a draft style keeps the fields the form doesn't send, and a value that is sent still wins", async () => {
    const { t } = await setup();
    const draftId = await t.run(async (ctx) =>
      ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v3",
        structure: "Ask for a reflection",
        color: "#111111",
        icon: "sparkles",
        status: "draft",
        version: 3,
        examples: [{ text: "What small win are you proud of this week?" }],
        cognitiveMove: "compare",
        riskLevel: "medium",
      }),
    );
    const edit = (fields: Record<string, unknown> = {}) =>
      t.withIdentity(ADMIN).mutation(api.admin.styles.updateStyle, {
        _id: draftId,
        id: "reflective",
        name: "Reflective v3, edited",
        structure: "Ask for a reflection",
        color: "#111111",
        icon: "sparkles",
        ...fields,
      });

    await edit();
    expect(await t.run(async (ctx) => ctx.db.get(draftId))).toMatchObject({
      name: "Reflective v3, edited",
      status: "draft",
      examples: [{ text: "What small win are you proud of this week?" }],
      cognitiveMove: "compare",
      riskLevel: "medium",
    });

    await edit({ examples: [] });
    expect((await t.run(async (ctx) => ctx.db.get(draftId)))?.examples).toEqual([]);
  });

  test("editing a tone keeps its examples and cues, on the new draft and on later draft edits", async () => {
    const { t, toneId } = await setup();
    const kept = {
      examples: [{ text: "What always cheers you up?" }],
      languageCues: ["cozy"],
      avoidCues: ["sarcasm"],
      emotionalAxes: { warmth: 5, playfulness: 3, seriousness: 1, surrealness: 1, sharpness: 1, intimacy: 3 },
    };
    await t.run(async (ctx) => {
      await ctx.db.patch(toneId, kept);
    });
    const edit = (_id: typeof toneId, name: string) =>
      t.withIdentity(ADMIN).mutation(api.admin.tones.updateTone, {
        _id,
        name,
        promptGuidanceForAI: "Be warm",
        color: "#222222",
        icon: "sun",
      });
    const draft = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("tones").withIndex("by_slug", (q) => q.eq("slug", "warm")).collect()).find(
          (tone) => tone.status === "draft",
        ),
      );

    await edit(toneId, "Warm v2");
    const created = await draft();
    expect(created).toMatchObject({ name: "Warm v2", version: 2, ...kept });

    await edit(created!._id, "Warm v2, edited");
    expect(await draft()).toMatchObject({ _id: created!._id, name: "Warm v2, edited", ...kept });
  });
});

describe("the review queue and who can open a held question", () => {
  test("only admins can read the queue, and it holds every pending question however many newer ones arrive", async () => {
    const { t } = await setup();
    const aiId = await insertAiQuestion(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 100; i += 1) {
        await ctx.db.insert("questions", { text: `Public question number ${i}?`, status: "public", ...counters });
      }
    });
    const userSubmittedId = await t.run(async (ctx) => {
      const authorId = await ctx.db.insert("users", { email: "author@example.com", clerkId: "author-clerk" });
      return await ctx.db.insert("questions", { customText: "What is your go-to karaoke song?", authorId, status: "pending", ...counters });
    });

    await expect(t.query(api.admin.questions.getPendingQuestions, {})).rejects.toThrow(/Not authenticated/);
    await expect(t.withIdentity(READER).query(api.admin.questions.getPendingQuestions, {})).rejects.toThrow(/Not an admin/);

    // The main list skips pending questions, so reviewed ones fill it.
    const newest = await t.withIdentity(ADMIN).query(api.admin.questions.getQuestions, {});
    expect(newest).toHaveLength(100);
    expect(newest.every((q: { status?: string }) => q.status !== "pending")).toBe(true);
    const queue = await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((q: { _id: string }) => q._id)).toEqual([aiId, userSubmittedId]);
  });

  test("a pending question that isn't an unowned AI question still can't be opened by link", async () => {
    const { t } = await setup();
    const ids = await t.run(async (ctx) => {
      const authorId = await ctx.db.insert("users", { email: "author@example.com", clerkId: "author-clerk" });
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      const pending = { status: "pending" as const, ...counters };
      return {
        submitted: await ctx.db.insert("questions", { text: "Submitted by a user?", authorId, ...pending }),
        aiWithAuthor: await ctx.db.insert("questions", { text: "AI but authored?", isAIGenerated: true, heldForReview: true, authorId, ...pending }),
        aiInOrg: await ctx.db.insert("questions", { text: "AI for a team?", isAIGenerated: true, heldForReview: true, organizationId: orgId, ...pending }),
        adminDraft: await ctx.db.insert("questions", { text: "Admin draft?", ...pending }),
      };
    });

    for (const id of Object.values(ids)) {
      expect(await t.query(api.core.questions.getQuestionById, { id })).toBeNull();
      expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toBeNull();
    }
  });

  test("a held AI question's image can be fetched by link until it is rejected", async () => {
    const { t } = await setup();
    const imageStorageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
    const id = await insertAiQuestion(t, { imageStorageId });

    expect(await t.query(api.core.questions.getQuestionImageUrl, { questionId: id })).toEqual(expect.any(String));
    expect((await t.query(api.core.questions.getQuestionForOgImage, { id }))?.imageUrl).toEqual(expect.any(String));

    await t.run(async (ctx) => {
      await ctx.db.patch(id, { status: "private" });
    });
    expect(await t.query(api.core.questions.getQuestionImageUrl, { questionId: id })).toBeNull();
  });

  test("the share image names the active version over a newer draft, and the newest version when none is active", async () => {
    const { t, styleV2 } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Reflective v3 draft",
        structure: "Ask for a reflection",
        color: "#999999",
        icon: "sparkles",
        status: "draft",
        version: 3,
      });
    });
    const id = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "What made you laugh this week?", style: "reflective", tone: "warm", status: "public", ...counters }),
    );

    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toMatchObject({ styleName: "Reflective v2", toneName: "Warm" });

    await t.run(async (ctx) => {
      await ctx.db.patch(styleV2, { status: "archived" });
    });
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toMatchObject({ styleName: "Reflective v3 draft" });
  });

  test("the reader can still like a question held for review", async () => {
    const { t } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    const id = await insertAiQuestion(t);

    await t.withIdentity(READER).mutation(api.core.questions.recordAnalytics, { questionId: id, event: "liked", viewDuration: 1000 });

    const { question, link } = await t.run(async (ctx) => ({
      question: await ctx.db.get(id),
      link: await ctx.db
        .query("userQuestions")
        .withIndex("by_userIdAndQuestionId", (q) => q.eq("userId", userId).eq("questionId", id))
        .first(),
    }));
    expect(question?.totalLikes).toBe(1);
    expect(link?.status).toBe("liked");
  });
});

describe("the feed and the daily email end to end", () => {
  async function feedReader(t: TestConvex) {
    return await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
  }
  const usageCounts = (t: TestConvex, userId: string) =>
    t.run(async (ctx) => (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === userId).map((row) => row.count));

  test("a feed question comes back to the person who asked for it, held for review, and uses their quota", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await feedReader(t);
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);

    const questions = await t
      .withIdentity(READER)
      .action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleV2, anchoredToneId: toneId });

    expect(questions.map((q) => [q?.text, q?.status])).toEqual([["What made you laugh this week?", "pending"]]);
    expect(await usageCounts(t, userId)).toEqual([1]);
    const [run] = await t.run(async (ctx) => ctx.db.query("generationRuns").collect());
    expect(run).toMatchObject({ purpose: "feed", status: "succeeded", insertedCount: 1 });
  });

  test("a paid-for unusable answer keeps the quota use even when its retry was cut off", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await feedReader(t);
    create
      .mockResolvedValueOnce(completion("not json at all") as never)
      .mockResolvedValueOnce(completion("", "length") as never);

    await expect(
      t.withIdentity(READER).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleV2, anchoredToneId: toneId }),
    ).rejects.toThrow(/couldn't use/);

    expect(create).toHaveBeenCalledTimes(2);
    expect(await usageCounts(t, userId)).toEqual([1]);
  });

  test("a provider error on the retry still counts the paid-for first answer", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await feedReader(t);
    create
      .mockResolvedValueOnce(completion("") as never)
      .mockRejectedValueOnce(APIError.generate(400, undefined, "Provider returned error", {}) as never);

    await expect(
      t.withIdentity(READER).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleV2, anchoredToneId: toneId }),
    ).rejects.toThrow(/couldn't use/);

    expect(create).toHaveBeenCalledTimes(2);
    expect(await usageCounts(t, userId)).toEqual([1]);
    const runs = await t.run(async (ctx) => (await ctx.db.query("generationRuns").collect()).map((run) => [run.status, run.error]));
    expect(runs).toEqual([
      ["failed", expect.stringMatching(/empty completion/)],
      ["failed", "400 Provider returned error"],
    ]);
  });

  test("an answer cut off by the output cap isn't retried, and refunds the quota", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await feedReader(t);
    create.mockResolvedValue(completion("", "length") as never);

    await expect(
      t.withIdentity(READER).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleV2, anchoredToneId: toneId }),
    ).rejects.toThrow(/empty completion/);

    // The same request under the same cap would be cut off again.
    expect(create).toHaveBeenCalledTimes(1);
    expect(await usageCounts(t, userId)).toEqual([0]);
  });

  test("the daily email falls back to a new AI question held for review, and its link and image open signed out", async () => {
    const { t } = await setup();
    await t.run(async (ctx) =>
      ctx.db.insert("users", { email: READER.email, clerkId: READER.subject, newsletterSubscriptionStatus: "subscribed" }),
    );
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);

    const email = await t.action(internal.internal.newsletter.getQuestionForUser, { email: READER.email });

    expect(email.question).toBe("What made you laugh this week?");
    expect(email.questionUrl.endsWith(`/question/${email.questionId}`)).toBe(true);
    expect(email.imageUrl.endsWith(`/api/og?id=${email.questionId}`)).toBe(true);
    expect((await t.run(async (ctx) => ctx.db.get(email.questionId)))?.status).toBe("pending");
    expect((await t.query(api.core.questions.getQuestionById, { id: email.questionId }))?._id).toBe(email.questionId);
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id: email.questionId })).toMatchObject({
      text: "What made you laugh this week?",
    });
  });
});

describe("remix and preview retries", () => {
  test("a remix that comes back as only quotes is retried once, and the second answer is used", async () => {
    const { t, toneId } = await setup();
    const questionId = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "What is your favorite breakfast?", status: "public", toneId, ...counters }),
    );
    create
      .mockResolvedValueOnce(completion('""') as never)
      .mockResolvedValueOnce(completion('"Which breakfast could you eat forever?"') as never);

    await expect(t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId })).resolves.toBe(
      "Which breakfast could you eat forever?",
    );

    const runs = await t.run(async (ctx) =>
      (await ctx.db.query("generationRuns").collect()).map((run) => [run.purpose, run.status, run.rawResponse ?? null]),
    );
    expect(runs).toEqual([
      ["remix", "failed", '""'],
      ["remix", "succeeded", '"Which breakfast could you eat forever?"'],
    ]);
  });

  test("a preview that gets two unusable answers fails after the one retry", async () => {
    const { t, styleV2, toneId } = await setup();
    create.mockResolvedValue(completion(JSON.stringify({ questions: [] })) as never);

    await expect(
      t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId: styleV2, toneId }),
    ).rejects.toThrow();

    expect(create).toHaveBeenCalledTimes(2);
    const runs = await t.run(async (ctx) => (await ctx.db.query("generationRuns").collect()).map((run) => [run.status, run.error]));
    expect(runs).toEqual([
      ["failed", "Model output had no questions"],
      ["failed", "Model output had no questions"],
    ]);
  });
});

describe("where held questions stay out", () => {
  test("the daily email pool skips a held question until it is approved", async () => {
    const { t } = await setup();
    const aiId = await insertAiQuestion(t);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    const pick = () =>
      t.query(internal.internal.questions.getFirstEligibleNewsletterQuestionForUser, {
        userId,
        questionIds: [aiId],
        excludedQuestionIds: [],
      });

    expect(await pick()).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(aiId, { status: "public" });
    });
    expect((await pick())?._id).toBe(aiId);
  });

  test("a matrix fill's question is held too: it waits in the admin's queue, and the team's grid and the feed don't list it", async () => {
    const { t } = await setup();
    const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
    const orgId = await t.run(async (ctx) => {
      const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      await ctx.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
      return orgId;
    });
    create.mockResolvedValue(completion(questionsJson("Which small thing made you smile today?")) as never);

    const result = await t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
      organizationId: orgId,
      axisY: "style",
      axisX: "tone",
      topicSlug: "any-topic",
      cells: [{ ySlug: "reflective", xSlug: "warm", styleSlug: "reflective", toneSlug: "warm" }],
    });

    expect(result).toEqual({ totalCells: 1, filledCells: 1, totalQuestionsGenerated: 1, skippedExisting: 0, skippedWaitingForReview: 0, skippedInvalidTaxonomy: 0 });
    const saved = await t.run(async (ctx) => ctx.db.query("questions").collect());
    expect(saved.map((q) => [q.text, q.status, q.heldForReview])).toEqual([["Which small thing made you smile today?", "pending", true]]);
    const queue = await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((q: { _id: string }) => q._id)).toEqual([saved[0]._id]);
    // The grid shows the library list, so the cell stays empty for the team until the review.
    expect(await t.withIdentity(ME).query(api.core.questions.getPublicQuestions, {})).toEqual([]);
    expect(
      await t.query(internal.internal.questions.getRandomQuestionsInternal, { count: 10, seen: [], hidden: [], hiddenStyles: [], hiddenTones: [] }),
    ).toEqual([]);
  });
});

describe("a grid cell and the nightly pool while their questions wait for review", () => {
  const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
  const POOL_DATE = "2026-10-12";
  const NOTHING_APPROVED = "No pool questions available. A pool question is handed out once it has been approved in the review queue.";
  const KEPT = "Questions of this style the owner kept, which are already in the library:";

  beforeEach(() => {
    // The pool is written and handed out by date, so the day is pinned.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 12, 19, 0));
    // A test names each answer it expects. Any other call fails here instead of reaching a provider.
    create.mockRejectedValue(new Error("unexpected provider call") as never);
    vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("unexpected embedding call"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  /** A manager of a paid team, and two more tones, so the Reflective row of the grid has three cells. */
  async function team() {
    const s = await setup();
    const ids = await s.t.run(async (ctx) => {
      const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
      const organizationId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId, role: "manager" });
      for (const slug of ["bold", "dry"]) {
        await ctx.db.insert("tones", { id: slug, slug, name: slug, promptGuidanceForAI: "x", color: "#333333", icon: "flame", status: "active", version: 1 });
      }
      return { meId, organizationId };
    });
    return { ...s, ...ids };
  }
  type Team = Awaited<ReturnType<typeof team>>;

  /** The model's next answers, one question each. */
  const writes = (...texts: string[]) => {
    for (const text of texts) create.mockResolvedValueOnce(completion(questionsJson(text)) as never);
  };
  const fillBatch = (s: Team, tones: string[]) =>
    s.t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
      organizationId: s.organizationId,
      axisY: "style",
      axisX: "tone",
      cells: tones.map((toneSlug) => ({ ySlug: "reflective", xSlug: toneSlug, styleSlug: "reflective", toneSlug })),
    });
  const fillOne = (s: Team, toneSlug: string) =>
    s.t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, { organizationId: s.organizationId, styleSlug: "reflective", toneSlug });
  const stored = (t: TestConvex, id: Id<"questions">) => t.run(async (ctx) => ctx.db.get(id));
  const allQuestions = (t: TestConvex) => t.run(async (ctx) => ctx.db.query("questions").collect());
  const reviewQueue = async (t: TestConvex): Promise<Id<"questions">[]> =>
    (await t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {})).map((q: { _id: Id<"questions"> }) => q._id);
  /** Exactly what the Approve button sends. */
  async function approve(t: TestConvex, id: Id<"questions">) {
    const question = (await stored(t, id))!;
    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, {
      id,
      expectedRevision: question.reviewRevision ?? 0,
      reviewReason: "Looks good",
      text: question.text,
      style: question.style,
      tone: question.tone,
      status: "public",
    });
  }

  test("a batch fill skips a cell whose only question is waiting for review, with no model call, and still fills the cell beside it", async () => {
    const s = await team();
    writes("What made you laugh this week?", "Which risk are you glad you took?");
    expect(await fillBatch(s, ["warm"])).toMatchObject({ filledCells: 1, totalQuestionsGenerated: 1 });

    const again = await fillBatch(s, ["warm", "bold"]);

    expect(again).toEqual({ totalCells: 2, filledCells: 1, totalQuestionsGenerated: 1, skippedExisting: 1, skippedWaitingForReview: 1, skippedInvalidTaxonomy: 0 });
    // One call for each question written: the cell with a question waiting cost nothing.
    expect(create).toHaveBeenCalledTimes(2);
    expect((await allQuestions(s.t)).map((q) => [q.text, q.tone, q.status, q.heldForReview])).toEqual([
      ["What made you laugh this week?", "warm", "pending", true],
      ["Which risk are you glad you took?", "bold", "pending", true],
    ]);

    // With a question waiting in both cells, a third fill writes nothing and calls nothing.
    expect(await fillBatch(s, ["warm", "bold"])).toEqual({ totalCells: 2, filledCells: 0, totalQuestionsGenerated: 0, skippedExisting: 2, skippedWaitingForReview: 2, skippedInvalidTaxonomy: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(await s.t.run(async (ctx) => ctx.db.query("matrixFillCellLocks").collect())).toEqual([]);
  });

  // Pending questions that aren't the shared library's. None of them takes a grid cell.
  test.each<[string, (s: Team) => Record<string, unknown>]>([
    ["a person's own submission", (s) => ({ authorId: s.meId })],
    ["a team's own question", (s) => ({ organizationId: s.organizationId, isAIGenerated: true, heldForReview: true })],
    ["a person's own question of the personal kind", (s) => ({ authorId: s.meId, kind: "personal", heldForReview: true })],
  ])("a cell whose only pending question is %s is not taken: a batch fill and a single-cell fill both write to it", async (_whose, fields) => {
    const s = await team();
    await s.t.run(async (ctx) => {
      for (const tone of ["warm", "bold"]) {
        await ctx.db.insert("questions", { text: `Pending in the ${tone} cell?`, style: "reflective", tone, status: "pending", ...counters, ...fields(s) });
      }
    });
    writes("What made you laugh this week?", "Which risk are you glad you took?");

    expect(await fillBatch(s, ["warm"])).toEqual({ totalCells: 1, filledCells: 1, totalQuestionsGenerated: 1, skippedExisting: 0, skippedWaitingForReview: 0, skippedInvalidTaxonomy: 0 });
    expect(await fillOne(s, "bold")).toMatchObject({ count: 1, waitingForReview: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("a single-cell fill writes one question to wait for review, and asked again it writes nothing, calls no model and says one is waiting", async () => {
    const s = await team();
    writes("What made you laugh this week?");

    const first = await fillOne(s, "warm");

    expect(first).toEqual({ count: 1, questionIds: [expect.any(String)], waitingForReview: true });
    expect(await stored(s.t, first.questionIds[0])).toMatchObject({
      text: "What made you laugh this week?",
      style: "reflective",
      tone: "warm",
      status: "pending",
      heldForReview: true,
    });
    expect(await reviewQueue(s.t)).toEqual(first.questionIds);

    expect(await fillOne(s, "warm")).toEqual({ count: 0, questionIds: [], waitingForReview: true });
    expect(create).toHaveBeenCalledTimes(1);
    const { runs, locks } = await s.t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      locks: await ctx.db.query("matrixFillCellLocks").collect(),
    }));
    expect(runs).toHaveLength(1);
    expect(locks).toEqual([]);
  });

  test("a question the feed or the daily email wrote for a cell's style and tone, still waiting, takes the cell too", async () => {
    const s = await team();
    await insertAiQuestion(s.t, { style: "reflective", tone: "dry" });

    expect(await fillOne(s, "dry")).toEqual({ count: 0, questionIds: [], waitingForReview: true });
    expect(await fillBatch(s, ["dry"])).toMatchObject({ filledCells: 0, skippedExisting: 1, skippedWaitingForReview: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  test.each<[string, "public" | "approved" | undefined]>([
    ["a public question", "public"],
    ["a question approved under the older status", "approved"],
    ["an old question with no status", undefined],
  ])("a single-cell fill of a cell that lists %s writes nothing and says none is waiting, even when another one is", async (_what, status) => {
    const s = await team();
    await s.t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "Which workout do you secretly love?", style: "reflective", tone: "warm", status, ...counters }),
    );
    await insertAiQuestion(s.t, { style: "reflective", tone: "warm" });

    expect(await fillOne(s, "warm")).toEqual({ count: 0, questionIds: [], waitingForReview: false });
    // A batch fill counts the cell as taken, and not as one the grid shows empty.
    expect(await fillBatch(s, ["warm"])).toMatchObject({ filledCells: 0, skippedExisting: 1, skippedWaitingForReview: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  test.each([
    ["retired", "pruned"],
    ["rejected in review", "private"],
  ] as const)("once the question waiting in a cell is %s, the cell can be filled again", async (_how, status) => {
    const s = await team();
    writes("What made you laugh this week?", "Which small win are you proud of this month?");
    const { questionIds: [firstId] } = await fillOne(s, "warm");
    await s.t.run(async (ctx) => ctx.db.patch(firstId, { status }));

    const second = await fillOne(s, "warm");

    expect(second).toMatchObject({ count: 1, waitingForReview: true });
    expect(second.questionIds).not.toContain(firstId);
    expect(await reviewQueue(s.t)).toEqual(second.questionIds);
    // The new question takes the cell in its turn.
    expect(await fillBatch(s, ["warm"])).toMatchObject({ filledCells: 0, skippedExisting: 1, skippedWaitingForReview: 1 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("once an admin approves a grid fill's question it is public and on the team's grid, and a later fill skips the cell as listed", async () => {
    const s = await team();
    writes("What made you laugh this week?");
    const { questionIds: [id] } = await fillOne(s, "warm");

    await approve(s.t, id);

    const approved = await stored(s.t, id);
    expect([approved?.status, approved?.heldForReview]).toEqual(["public", undefined]);
    expect(await reviewQueue(s.t)).toEqual([]);
    expect((await s.t.withIdentity(ME).query(api.core.questions.getPublicQuestions, {})).map((q) => q._id)).toEqual([id]);
    expect(await fillOne(s, "warm")).toEqual({ count: 0, questionIds: [], waitingForReview: false });
    expect(await fillBatch(s, ["warm"])).toEqual({ totalCells: 1, filledCells: 0, totalQuestionsGenerated: 0, skippedExisting: 1, skippedWaitingForReview: 0, skippedInvalidTaxonomy: 0 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("a grid fill's question is not shown to the generator as one the owner kept until it is approved", async () => {
    const s = await team();
    writes("What made you laugh this week?", "Which risk are you glad you took?");
    const { questionIds: [id] } = await fillOne(s, "warm");

    // The next prompt for the style, as the fill of the cell beside it sends it.
    await fillOne(s, "bold");
    const next = (create.mock.calls[1][0] as { messages: Array<{ content: string }> }).messages[1].content;
    expect(next).not.toContain(KEPT);
    expect(next).not.toContain("What made you laugh this week?");

    await approve(s.t, id);

    const { userPrompt } = await s.t.query(internal.internal.generation.buildGenerationPrompt, { styleSlug: "reflective", toneSlug: "dry", batchSize: 1 });
    expect(userPrompt).toContain(`\n${KEPT}\n- "What made you laugh this week?"\n\n`);
    // The question still waiting is still not shown.
    expect(userPrompt).not.toContain("Which risk are you glad you took?");
  });

  /** A daily-email subscriber, and a pool run that writes three questions for today's pool. */
  async function poolRun() {
    const s = await setup();
    const readerId = await s.t.run(async (ctx) =>
      ctx.db.insert("users", { email: READER.email, clerkId: READER.subject, newsletterSubscriptionStatus: "subscribed" }),
    );
    create.mockResolvedValueOnce(
      completion(questionsJson("What song is stuck in your head?", "Which smell takes you back to childhood?", "What chore do you secretly enjoy?")) as never,
    );
    const result = await s.t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 3, maxCombinations: 1 });
    expect(result).toEqual({ questionsGenerated: 3, combinationsProcessed: 1, errors: [] });
    // The hand-out reports by email once it has processed someone. Nothing leaves the test.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network call"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    return { ...s, readerId, ids: (await allQuestions(s.t)).map((q) => q._id) };
  }
  const handOut = (t: TestConvex, poolDate?: string) =>
    t.action(internal.internal.questions.assignPoolQuestionsToUsers, { questionsPerUser: 6, poolDate });
  const poolRows = async (t: TestConvex) => (await allQuestions(t)).map((q) => [q.status, q.heldForReview, q.poolDate, q.poolStatus]);
  const handedOut = async (t: TestConvex) =>
    (await t.run(async (ctx) => ctx.db.query("userQuestions").collect())).map((row) => [row.userId, row.questionId, row.status]);

  test("the pool's questions are saved held for today's pool, none is handed out while none is approved, and then only the approved one is", async () => {
    const s = await poolRun();
    const HELD = ["pending", true, POOL_DATE, "available"];
    expect(await poolRows(s.t)).toEqual([HELD, HELD, HELD]);
    expect(await reviewQueue(s.t)).toEqual(s.ids);

    expect(await handOut(s.t)).toEqual({ usersProcessed: 0, totalAssigned: 0, errors: [NOTHING_APPROVED] });
    expect(await handedOut(s.t)).toEqual([]);
    expect(await poolRows(s.t)).toEqual([HELD, HELD, HELD]);

    await approve(s.t, s.ids[1]);

    expect(await handOut(s.t)).toEqual({ usersProcessed: 1, totalAssigned: 1, errors: [] });
    expect(await handedOut(s.t)).toEqual([[s.readerId, s.ids[1], "unseen"]]);
    // The two still waiting stay in the pool, unassigned.
    expect(await poolRows(s.t)).toEqual([HELD, ["public", undefined, POOL_DATE, "distributed"], HELD]);
    expect(await reviewQueue(s.t)).toEqual([s.ids[0], s.ids[2]]);
  });

  test("the hand-out reads only the pool questions the lists show, however many held ones were written first", async () => {
    const { t } = await setup();
    const pool = { poolDate: POOL_DATE, poolStatus: "available" as const, isAIGenerated: true, ...counters };
    const ids = await t.run(async (ctx) => ({
      held: await ctx.db.insert("questions", { text: "Still waiting?", status: "pending", heldForReview: true, ...pool }),
      rejected: await ctx.db.insert("questions", { text: "Rejected in review?", status: "private", ...pool }),
      retired: await ctx.db.insert("questions", { text: "Approved, then retired?", status: "pruned", prunedAt: 1, ...pool }),
      // Older pruning set only the time and left the status as it was.
      retiredTheOldWay: await ctx.db.insert("questions", { text: "Approved, then pruned the old way?", status: "approved", prunedAt: 1, ...pool }),
      approved: await ctx.db.insert("questions", { text: "Approved in review?", status: "public", ...pool }),
      approvedLongAgo: await ctx.db.insert("questions", { text: "Approved under the older status?", status: "approved", ...pool }),
      // A copy retired as a duplicate still opens by its link, and is not handed out.
      retiredDuplicate: await ctx.db.insert("questions", {
        text: "Approved, then retired as a copy?",
        status: "pruned",
        prunedAt: 1,
        duplicateOf: await ctx.db.insert("questions", { text: "The one that was kept?", status: "public", ...counters }),
        duplicateWasPublic: true,
        ...pool,
      }),
      alreadyHandedOut: await ctx.db.insert("questions", { text: "Handed out already?", status: "public", ...pool, poolStatus: "distributed" }),
      anotherDay: await ctx.db.insert("questions", { text: "Approved for another day's pool?", status: "public", ...pool, poolDate: "2026-10-11" }),
    }));
    const available = async (limit?: number): Promise<Id<"questions">[]> =>
      (await t.query(internal.internal.questions.getAvailablePoolQuestions, { poolDate: POOL_DATE, limit })).map((q: { _id: Id<"questions"> }) => q._id);

    expect(await available()).toEqual([ids.approved, ids.approvedLongAgo]);
    // The limit counts approved questions, so the ones written before them can't use it up.
    expect(await available(1)).toEqual([ids.approved]);
  });

  test("the admin's pool page counts held questions apart: all awaiting review after a run, one available once approved, one distributed once handed out", async () => {
    const s = await poolRun();
    const admin = s.t.withIdentity(ADMIN);
    const stats = async () => {
      const { totalQuestions, availableQuestions, awaitingReviewQuestions, distributedQuestions } = await admin.query(api.admin.questions.getPoolStats, { poolDate: POOL_DATE });
      return { totalQuestions, availableQuestions, awaitingReviewQuestions, distributedQuestions };
    };
    /** Each pool question's row, as [handed out or not, still awaiting review], in the order they were written. */
    const rows = async () => {
      const listed = await admin.query(api.admin.questions.getPoolQuestions, { poolDate: POOL_DATE });
      return s.ids.map((id) => {
        const row = listed.find((candidate) => candidate._id === id);
        return [row?.poolStatus, row?.awaitingReview];
      });
    };

    expect(await stats()).toEqual({ totalQuestions: 3, availableQuestions: 0, awaitingReviewQuestions: 3, distributedQuestions: 0 });
    expect(await rows()).toEqual([["available", true], ["available", true], ["available", true]]);

    await approve(s.t, s.ids[1]);

    expect(await stats()).toEqual({ totalQuestions: 3, availableQuestions: 1, awaitingReviewQuestions: 2, distributedQuestions: 0 });
    expect(await rows()).toEqual([["available", true], ["available", false], ["available", true]]);

    await handOut(s.t);

    expect(await stats()).toEqual({ totalQuestions: 3, availableQuestions: 0, awaitingReviewQuestions: 2, distributedQuestions: 1 });
    expect(await rows()).toEqual([["available", true], ["distributed", false], ["available", true]]);
  });

  test("a pool question rejected or retired in review is neither available nor awaiting review on the admin's pool page", async () => {
    const s = await poolRun();
    const admin = s.t.withIdentity(ADMIN);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.ids[0], { status: "private", heldForReview: undefined });
      await ctx.db.patch(s.ids[1], { status: "pruned", prunedAt: 1, heldForReview: undefined });
    });

    const { totalQuestions, availableQuestions, awaitingReviewQuestions, distributedQuestions } = await admin.query(api.admin.questions.getPoolStats, { poolDate: POOL_DATE });
    expect({ totalQuestions, availableQuestions, awaitingReviewQuestions, distributedQuestions }).toEqual({
      totalQuestions: 3,
      availableQuestions: 0,
      awaitingReviewQuestions: 1,
      distributedQuestions: 0,
    });
    const listed = await admin.query(api.admin.questions.getPoolQuestions, { poolDate: POOL_DATE });
    expect(s.ids.map((id) => listed.find((row) => row._id === id)?.awaitingReview)).toEqual([false, false, true]);
  });

  test("a pool approved the day after it was written is handed out when the hand-out is given that pool's date, and not by a hand-out of the new day's pool", async () => {
    const s = await poolRun();
    vi.setSystemTime(Date.UTC(2026, 9, 13, 19, 0));
    await approve(s.t, s.ids[0]);

    // With no date the hand-out reads today's pool, which has nothing.
    expect(await handOut(s.t)).toEqual({ usersProcessed: 0, totalAssigned: 0, errors: [NOTHING_APPROVED] });
    expect(await handedOut(s.t)).toEqual([]);

    expect(await handOut(s.t, POOL_DATE)).toEqual({ usersProcessed: 1, totalAssigned: 1, errors: [] });
    expect(await handedOut(s.t)).toEqual([[s.readerId, s.ids[0], "unseen"]]);
    expect((await stored(s.t, s.ids[0]))?.poolStatus).toBe("distributed");
  });

  test("the admin's Assign hands out the pool for the date it is given, and refuses a date that isn't written as one", async () => {
    const s = await poolRun();
    const admin = s.t.withIdentity(ADMIN);
    vi.setSystemTime(Date.UTC(2026, 9, 13, 19, 0));
    await approve(s.t, s.ids[2]);

    const refused = await admin.action(api.admin.questions.triggerPoolAssignment, { poolDate: "yesterday" }).catch((error: unknown) => error);
    expect(convexErrorData(refused)).toEqual({ code: "POOL_SETUP", message: "poolDate must be a date written as YYYY-MM-DD." });
    expect(await handedOut(s.t)).toEqual([]);

    expect(await admin.action(api.admin.questions.triggerPoolAssignment, { poolDate: POOL_DATE })).toEqual({ usersProcessed: 1, totalAssigned: 1, errors: [] });
    expect(await handedOut(s.t)).toEqual([[s.readerId, s.ids[2], "unseen"]]);
    await expect(s.t.withIdentity(READER).action(api.admin.questions.triggerPoolAssignment, { poolDate: POOL_DATE })).rejects.toThrow();
  });
});

describe("review fixes", () => {
  test("approving a held AI question through the admin mutation keeps its style and tone versions", async () => {
    const { t, styleV2, toneId } = await setup();
    const id = await insertAiQuestion(t, { style: "reflective", styleId: styleV2, tone: "warm", toneId });

    // Exactly what the Approve button sends.
    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, {
      id,
      expectedRevision: 0,
      reviewReason: "Looks good",
      text: "What made you laugh this week?",
      style: "reflective",
      tone: "warm",
      status: "public",
    });

    const approved = await t.run(async (ctx) => ctx.db.get(id));
    expect(approved).toMatchObject({ status: "public", styleId: styleV2, toneId });
  });

  test("changing a question's style slug picks that style's active version, not an archived one", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();
    const id = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "Which song do you know every word of?", style: "other", tone: "warm", toneId, status: "public", ...counters }),
    );

    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, { id, style: "reflective" });

    const updated = await t.run(async (ctx) => ctx.db.get(id));
    expect(updated?.styleId).toBe(styleV2);
    expect(updated?.styleId).not.toBe(styleV1);
  });

  test("a paid unusable answer keeps the quota when the retry is stopped by the daily budget", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    create.mockImplementationOnce((async () => {
      // Other spend uses up today's budget while this answer comes back unusable.
      await t.run(async (ctx) => {
        await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 1000, calls: 1 });
      });
      return completion("not json at all");
    }) as never);

    await expect(
      t.withIdentity(READER).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: styleV2, anchoredToneId: toneId }),
    ).rejects.toThrow(/paused/);

    expect(create).toHaveBeenCalledTimes(1);
    const usage = await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect()).filter((row) => row.userId === userId).map((row) => row.count),
    );
    expect(usage).toEqual([1]);
  });

  test("the share image never names another organization's copy of a style", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("styles", {
        id: "reflective",
        slug: "reflective",
        name: "Gym reflective",
        structure: "x",
        color: "#444444",
        icon: "dumbbell",
        status: "active",
        version: 9,
        organizationId: orgId,
      });
    });
    const id = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "What made you laugh this week?", style: "reflective", tone: "warm", status: "public", ...counters }),
    );

    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toMatchObject({ styleName: "Reflective v2" });
  });

  test("a duplicate group with a held AI question waits for that review, and the held link keeps working", async () => {
    const { t } = await setup();
    const heldId = await insertAiQuestion(t);
    const { keepId, detectionId } = await t.run(async (ctx) => {
      const keepId = await ctx.db.insert("questions", { text: "What made you laugh this past week?", status: "public", ...counters });
      const detectionId = await ctx.db.insert("duplicateDetections", {
        questionIds: [keepId, heldId],
        reason: "same question",
        confidence: 0.99,
        status: "pending",
      });
      return { keepId, detectionId };
    });

    await expect(t.withIdentity(ADMIN).mutation(api.admin.questions.deleteDuplicateQuestions, {
      detectionId,
      questionIdsToDelete: [heldId],
      keepQuestionId: keepId,
      reason: "Same question",
      expectedRevisions: [
        { questionId: keepId, revision: 0 },
        { questionId: heldId, revision: 0 },
      ],
    })).rejects.toThrow(/held for review/);

    const held = await t.run(async (ctx) => ctx.db.get(heldId));
    expect(held).toMatchObject({ status: "pending" });
    expect(held?.duplicateOf).toBeUndefined();
    expect((await t.query(api.core.questions.getQuestionById, { id: heldId }))?._id).toBe(heldId);
  });
});

describe("held questions stay out of team schedules and search caches", () => {
  test("a team schedule takes a public question but not one held for review", async () => {
    const { t } = await setup();
    const MANAGER = { subject: "manager-clerk", tokenIdentifier: "test|manager-clerk", email: "manager@example.com" };
    const { orgId, publicId } = await t.run(async (ctx) => {
      const managerId = await ctx.db.insert("users", { email: MANAGER.email, clerkId: MANAGER.subject });
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: managerId, organizationId: orgId, role: "manager" });
      const publicId = await ctx.db.insert("questions", { text: "Which workout do you secretly love?", status: "public", ...counters });
      return { orgId, publicId };
    });
    const heldId = await insertAiQuestion(t);
    const manager = t.withIdentity(MANAGER);
    const scheduleId = await manager.mutation(api.core.schedules.createSchedule, { organizationId: orgId, weekStart: "2026-10-05" });

    await expect(
      manager.mutation(api.core.schedules.assignQuestion, { scheduleId, dayOfWeek: "monday", questionId: heldId }),
    ).rejects.toThrow(/not available to this organization/);
    // Another person's submission that is still pending review can't go on a team schedule either.
    const submittedId = await t.run(async (ctx) => {
      const authorId = await ctx.db.insert("users", { email: "author@example.com", clerkId: "author-clerk" });
      return await ctx.db.insert("questions", { customText: "What is your go-to karaoke song?", authorId, status: "pending", ...counters });
    });
    await expect(
      manager.mutation(api.core.schedules.assignQuestion, { scheduleId, dayOfWeek: "monday", questionId: submittedId }),
    ).rejects.toThrow(/not available to this organization/);
    await manager.mutation(api.core.schedules.assignQuestion, { scheduleId, dayOfWeek: "monday", questionId: publicId });
  });

  test("the share image tells its routes whether the question is held, so they don't cache it for a year", async () => {
    const { t } = await setup();
    const heldId = await insertAiQuestion(t);
    const publicId = await insertAiQuestion(t, { text: "Which snack do you always come back to?", status: "public" });

    expect((await t.query(api.core.questions.getQuestionForOgImage, { id: heldId }))?.heldForReview).toBe(true);
    expect((await t.query(api.core.questions.getQuestionForOgImage, { id: publicId }))?.heldForReview).toBe(false);
  });
});

describe("adversarial review fixes", () => {
  test("only questions generation held are open by link; a pending AI question an admin parked stays hidden", async () => {
    const { t, styleV2, toneId } = await setup();
    const parkedId = await insertAiQuestion(t, { heldForReview: undefined });
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    create.mockResolvedValue(completion(questionsJson("Which snack do you always come back to?")) as never);
    const [generated] = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: styleV2,
      anchoredToneId: toneId,
    });

    expect(await t.query(api.core.questions.getQuestionById, { id: parkedId })).toBeNull();
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id: parkedId })).toBeNull();
    const held = await t.run(async (ctx) => ctx.db.get(generated!._id));
    expect(held).toMatchObject({ status: "pending", heldForReview: true });
    expect((await t.query(api.core.questions.getQuestionById, { id: generated!._id }))?._id).toBe(generated!._id);
  });

  test("a feed request anchored to an older style version generates with the active version", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    create.mockResolvedValue(completion(questionsJson("What made you laugh this week?")) as never);

    const questions = await t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId,
      bypassAIUsage: true,
      purpose: "feed",
      anchoredStyleId: styleV1,
      anchoredToneId: toneId,
    });

    expect(questions.map((q) => q?.styleId)).toEqual([styleV2]);
  });
});

describe("the hold ends at review", () => {
  test("a reviewed question moved back to pending is hidden, not reopened by its link", async () => {
    const { t } = await setup();
    const id = await insertAiQuestion(t);

    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, {
      id,
      expectedRevision: 0,
      reviewReason: "Not a good fit",
      status: "private",
    });
    expect((await t.run(async (ctx) => ctx.db.get(id)))?.heldForReview).toBeUndefined();

    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, {
      id,
      expectedRevision: 1,
      reviewReason: "Look again later",
      status: "pending",
    });
    expect(await t.query(api.core.questions.getQuestionById, { id })).toBeNull();
    expect(await t.query(api.core.questions.getQuestionForOgImage, { id })).toBeNull();
  });

  test("editing a held question's text keeps it held", async () => {
    const { t } = await setup();
    const id = await insertAiQuestion(t);

    await t.withIdentity(ADMIN).mutation(api.admin.questions.updateQuestion, {
      id,
      expectedRevision: 0,
      reviewReason: "Tighten wording",
      text: "What made you laugh out loud this week?",
      status: "pending",
    });

    expect((await t.query(api.core.questions.getQuestionById, { id }))?.text).toBe("What made you laugh out loud this week?");
  });

  test("a feed request anchored to a topic with no active version fails instead of dropping the topic", async () => {
    const { t, styleV2, toneId } = await setup();
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: READER.email, clerkId: READER.subject }));
    const topicId = await t.run(async (ctx) =>
      ctx.db.insert("topics", { id: "retired-topic", slug: "retired-topic", status: "archived", version: 1, name: "Retired" }),
    );

    await expect(
      t.action(internal.internal.ai.generateAIQuestionForUser, {
        userId,
        bypassAIUsage: true,
        purpose: "feed",
        anchoredStyleId: styleV2,
        anchoredToneId: toneId,
        topicId,
      }),
    ).rejects.toThrow(/topic isn't available/);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("duplicate resolution keeps public content public", () => {
  test("a rejected copy can't be kept over the public one", async () => {
    const { t } = await setup();
    const { rejectedId, publicId, detectionId } = await t.run(async (ctx) => {
      const rejectedId = await ctx.db.insert("questions", { text: "What made you laugh this week?", isAIGenerated: true, status: "private", ...counters });
      const publicId = await ctx.db.insert("questions", { text: "What made you laugh this past week?", status: "public", ...counters });
      const detectionId = await ctx.db.insert("duplicateDetections", {
        questionIds: [rejectedId, publicId],
        reason: "same question",
        confidence: 0.99,
        status: "pending",
      });
      return { rejectedId, publicId, detectionId };
    });

    await expect(
      t.withIdentity(ADMIN).mutation(api.admin.questions.deleteDuplicateQuestions, {
        detectionId,
        questionIdsToDelete: [publicId],
        keepQuestionId: rejectedId,
        reason: "Same question",
        expectedRevisions: [
          { questionId: rejectedId, revision: 0 },
          { questionId: publicId, revision: 0 },
        ],
      }),
    ).rejects.toThrow(/Keep a public question/);
    expect((await t.run(async (ctx) => ctx.db.get(publicId)))?.status).toBe("public");
  });
});

describe("bulk category updates", () => {
  test("an organization's question picks up the organization's own style for a slug", async () => {
    const { t } = await setup();
    const { questionId, orgStyleId } = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      const orgStyleId = await ctx.db.insert("styles", {
        id: "gym-only",
        slug: "gym-only",
        name: "Gym only",
        structure: "x",
        color: "#444444",
        icon: "dumbbell",
        status: "active",
        version: 1,
        organizationId: orgId,
      });
      const questionId = await ctx.db.insert("questions", {
        text: "Which workout do you secretly love?",
        status: "public",
        organizationId: orgId,
        ...counters,
      });
      return { questionId, orgStyleId };
    });

    const [result] = await t.withIdentity(ADMIN).mutation(api.admin.questions.updateCategories, {
      updates: [{ id: questionId, style: "gym-only" }],
    });

    expect(result.success).toBe(true);
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ style: "gym-only", styleId: orgStyleId });
  });
});

describe("every path that writes questions sends the short brief", () => {
  const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
  // What only the old prompt said: its headings, and the fields and the blueprint it was built from.
  const OLD_PROMPT = [
    "Structural instruction:",
    "Cognitive move:",
    "Quality checklist:",
    "Open with the words Looking back",
    "Recall and compare",
    "Checklist item from the blueprint",
  ];
  const THREE_QUESTIONS = questionsJson("What made you laugh this week?", "Which snack do you always come back to?", "What song is stuck in your head?");
  const sent = (call = 0) => (create.mock.calls[call][0] as { messages: Array<{ role: string; content: string }> }).messages;

  beforeEach(() => {
    // No scheduled embedding job runs here, and none could reach the provider if one did.
    vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("unexpected embedding call"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  /**
   * One live style and tone that each have a line, the fields and the blueprint the old prompt
   * read, and a daily-email reader who manages a paid team.
   */
  async function app() {
    const s = await setup();
    const organizationId = await s.t.run(async (ctx) => {
      await ctx.db.patch(s.styleV2, {
        brief: "Looks back on something small.",
        structuralInstruction: "Open with the words Looking back.",
        cognitiveMove: "Recall and compare.",
      });
      await ctx.db.patch(s.toneId, { brief: "Kind and unhurried." });
      await ctx.db.insert("promptBlueprints", {
        slug: DEFAULT_BLUEPRINT_SLUG,
        version: 1,
        status: "active",
        systemInstruction: "Checklist item from the blueprint.",
        safetyChecklist: ["Checklist item from the blueprint."],
        qualityChecklist: ["Checklist item from the blueprint."],
        outputFormatInstruction: "Checklist item from the blueprint.",
        createdAt: 0,
        updatedAt: 0,
      });
      const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject, newsletterSubscriptionStatus: "subscribed" });
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: meId, organizationId: orgId, role: "manager" });
      return orgId;
    });
    return { ...s, organizationId };
  }
  type App = Awaited<ReturnType<typeof app>>;
  const savedRuns = (s: App) => s.t.run(async (ctx) => ctx.db.query("generationRuns").collect());
  const cell = { ySlug: "reflective", xSlug: "warm", styleSlug: "reflective", toneSlug: "warm" };
  const fill = (s: App, topicSlug?: string) =>
    s.t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, { organizationId: s.organizationId, axisY: "style", axisX: "tone", topicSlug, cells: [cell] });
  const teamTopicPreview = (s: App) =>
    s.t.withIdentity(ME).action(api.core.teamPromptActions.previewTopicQuestions, {
      organizationId: s.organizationId,
      name: "Recovery",
      guidance: "Talk about rest days",
      styleId: s.styleV2,
      toneId: s.toneId,
    });

  // Each path from the entry point the app or its schedule calls, with the purpose its run records.
  const PATHS: Array<[string, string, (s: App) => Promise<unknown>]> = [
    ["the feed", "feed", (s) => s.t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: s.styleV2, anchoredToneId: s.toneId })],
    ["the nightly pool", "nightly_pool", (s) => s.t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 1, maxCombinations: 1 })],
    ["the daily email", "newsletter", (s) => s.t.action(internal.internal.newsletter.getQuestionForUser, { email: ME.email })],
    ["a grid fill", "feed", (s) => fill(s)],
    ["an admin preview", "admin_preview", (s) => s.t.withIdentity(ADMIN).action(api.admin.ai.generateAIQuestions, { selectedTags: [], styleId: s.styleV2, toneId: s.toneId })],
    ["a team's topic preview", "admin_preview", teamTopicPreview],
  ];

  test.each(PATHS)(
    "%s sends the brief's instructions and opens with the style's and tone's lines, with nothing from the old prompt, and its run is labelled brief-v2",
    async (_path, purpose, generate) => {
      const s = await app();
      create.mockResolvedValue(completion(THREE_QUESTIONS) as never);

      await generate(s);

      expect(create).toHaveBeenCalledTimes(1);
      const [system, user] = sent();
      expect(system).toEqual({ role: "system", content: BRIEF_SYSTEM_PROMPT });
      expect(user.role).toBe("user");
      expect(user.content.split("\n").slice(0, 2)).toEqual(["Style: Reflective v2. Looks back on something small.", "Tone: Warm. Kind and unhurried."]);
      for (const old of OLD_PROMPT) expect(`${system.content}\n${user.content}`).not.toContain(old);
      // The run names the wording that wrote its prompt, and no blueprint.
      expect((await savedRuns(s)).map((run) => [run.purpose, run.status, run.promptLabel, run.blueprintId, run.assembledPrompt])).toEqual([
        [purpose, "succeeded", "brief-v2", undefined, `${BRIEF_SYSTEM_PROMPT}\n\n${user.content}`],
      ]);
    },
  );

  test("a team's topic preview passes the team's words as notes, after the style's and tone's lines", async () => {
    const s = await app();
    create.mockResolvedValue(completion(THREE_QUESTIONS) as never);

    await teamTopicPreview(s);

    expect(sent()[1].content).toBe(
      [
        "Style: Reflective v2. Looks back on something small.",
        "Tone: Warm. Kind and unhurried.",
        "",
        "Notes from the team or admin:",
        "Team conversation topic: Recovery",
        "Desired outcome: Talk about rest days",
        "Return distinct options that a facilitator can ask exactly as written.",
        "",
        "Write 3 new questions for this style and tone.",
        'Return JSON only, in this shape: {"questions":[{"text":"...?"}]}',
      ].join("\n"),
    );
  });

  test("a grid fill with no topic sends no topic line and saves the question with none, and with a topic sends its line and saves the question under it", async () => {
    const s = await app();
    // A topic is in the catalog, and a fill that names none no longer picks one.
    await s.t.run(async (ctx) =>
      ctx.db.insert("topics", { id: "weekends", slug: "weekends", name: "Weekends", brief: "Days off and what fills them.", status: "active", version: 1 }),
    );
    create
      .mockResolvedValueOnce(completion(questionsJson("What made you laugh this week?")) as never)
      .mockResolvedValueOnce(completion(questionsJson("What does a slow Sunday look like for you?")) as never);

    expect(await fill(s)).toMatchObject({ filledCells: 1 });
    expect(await fill(s, "weekends")).toMatchObject({ filledCells: 1 });

    const lines = (call: number) => sent(call)[1].content.split("\n");
    expect(sent(0)[1].content).not.toContain("Topic:");
    expect(lines(0).slice(-2)[0]).toBe("Write 1 new question for this style and tone.");
    expect(lines(1)[2]).toBe("Topic: Weekends. Days off and what fills them.");
    expect(lines(1).slice(-2)[0]).toBe("Write 1 new question for this style, tone and topic.");
    const saved = await s.t.run(async (ctx) => ctx.db.query("questions").collect());
    expect(saved.map((q) => [q.text, q.topicSlug, q.topic, q.topicId !== undefined])).toEqual([
      ["What made you laugh this week?", undefined, undefined, false],
      ["What does a slow Sunday look like for you?", "weekends", "weekends", true],
    ]);
    expect((await savedRuns(s)).map((run) => [run.topicSlug, run.promptLabel])).toEqual([
      [undefined, "brief-v2"],
      ["weekends", "brief-v2"],
    ]);
  });

  test.each<[string, (s: App, questionId: Id<"questions">) => Promise<string>]>([
    ["an admin's remix", (s, questionId) => s.t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId })],
    ["a person's remix", (s, questionId) => s.t.withIdentity(ME).action(api.core.questions.remixQuestionForUser, { questionId, styleId: s.styleV2, toneId: s.toneId })],
  ])("%s is written from the same lines, with nothing from the old prompt, and its run is labelled remix-v2", async (_which, remix) => {
    const s = await app();
    const questionId = await s.t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "What is your favorite breakfast?", status: "public", styleId: s.styleV2, toneId: s.toneId, ...counters }),
    );
    create.mockResolvedValue(completion("Which breakfast could you eat forever?") as never);

    await expect(remix(s, questionId)).resolves.toBe("Which breakfast could you eat forever?");

    const prompt = sent().map((message) => message.content).join("\n");
    expect(prompt).toContain("\nSTYLE: Reflective v2. Looks back on something small.\nTONE: Warm. Kind and unhurried.\n");
    for (const old of OLD_PROMPT) expect(prompt).not.toContain(old);
    expect((await savedRuns(s)).map((run) => [run.purpose, run.promptLabel, run.blueprintId])).toEqual([["remix", "remix-v2", undefined]]);
  });
});
