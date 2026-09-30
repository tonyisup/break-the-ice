/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "./lib/promptArchitecture";
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
    await ctx.db.insert("promptBlueprints", {
      slug: DEFAULT_BLUEPRINT_SLUG,
      version: 1,
      status: "active",
      systemInstruction: "Write icebreakers.",
      safetyChecklist: [],
      qualityChecklist: [],
      outputFormatInstruction: "Return JSON.",
      createdAt: 0,
      updatedAt: 0,
    });
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
  test("an old version's id builds the prompt from the active version, with its examples", async () => {
    const { t, styleV1, styleV2, toneId } = await setup();

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, {
      styleId: styleV1,
      toneId,
      batchSize: 1,
    });

    expect(prompt.style._id).toBe(styleV2);
    expect(prompt.style.version).toBe(2);
    const text = `${prompt.systemPrompt}\n${prompt.userPrompt}`;
    expect(text).toContain("What small win are you proud of this week?");
    expect(text).not.toMatch(/Good examples:\n- none/);
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

describe("new feed and daily-email questions wait for review", () => {
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

  test("the nightly pool still saves public questions", async () => {
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
    expect(saved.map((q) => q.status)).toEqual(["public"]);
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
    create.mockRejectedValue(new Error("400 Provider returned error") as never);

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
    const userPrompt = (call: number) => (create.mock.calls[call][0] as { messages: Array<{ content: string }> }).messages[1].content;

    await t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId });
    expect(userPrompt(0)).toContain("Style: Reflective v2");

    await t.run(async (ctx) => {
      await ctx.db.patch(styleV2, { status: "archived" });
    });
    await t.withIdentity(ADMIN).action(api.admin.questions.remixQuestion, { id: questionId });
    expect(userPrompt(1)).toContain("Style: General");
    expect(userPrompt(1)).not.toContain("Reflective");
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
      .mockRejectedValueOnce(new Error("400 Provider returned error") as never);

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

describe("where held questions stay out, and what stays public", () => {
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

  test("matrix fill still saves its questions as public", async () => {
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

    await t.withIdentity(ME).action(api.core.fillMatrix.fillEmptyCells, {
      organizationId: orgId,
      axisY: "style",
      axisX: "tone",
      topicSlug: "any-topic",
      cells: [{ ySlug: "reflective", xSlug: "warm", styleSlug: "reflective", toneSlug: "warm" }],
    });

    const saved = await t.run(async (ctx) => ctx.db.query("questions").collect());
    expect(saved.map((q) => [q.text, q.status])).toEqual([["Which small thing made you smile today?", "public"]]);
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
