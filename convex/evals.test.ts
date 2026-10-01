/// <reference types="vite/client" />
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { spendDay } from "./lib/aiSpend";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "./lib/promptArchitecture";
import { checkEvalCandidates, evalFingerprint } from "./lib/evalChecks";
import { classifyFailure } from "../evals/runRecord.mjs";
import { openRouterClient } from "./lib/generationRunner";

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  create = vi.spyOn(openRouterClient.chat.completions, "create");
  process.env.EVALS_ENABLED = "true";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.EVALS_ENABLED;
});

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const questionsJson = (...texts: string[]) => JSON.stringify({ questions: texts.map((text) => ({ text })) });
/** A unit embedding whose cosine similarity with `atCosine(1)` is `cosine`. */
const atCosine = (cosine: number) => [cosine, Math.sqrt(1 - cosine * cosine), ...new Array<number>(382).fill(0)];

function completion(content: string) {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    created: 0,
    model: "anthropic/claude-haiku-5",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: { cost: 0.01 },
  };
}

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  await t.run(async (ctx) => {
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
    await ctx.db.insert("styles", {
      id: "desert-island",
      slug: "desert-island",
      name: "Desert Island v1",
      structure: "Old structure",
      color: "#111111",
      icon: "anchor",
      status: "archived",
      version: 1,
    });
    await ctx.db.insert("styles", {
      id: "desert-island",
      slug: "desert-island",
      name: "Desert Island",
      description: "Prioritization game.",
      structure: "You can only bring ___.",
      example: "Three albums, one book.",
      color: "#111111",
      icon: "anchor",
      status: "active",
      version: 2,
    });
    await ctx.db.insert("tones", {
      id: "witty",
      slug: "witty",
      name: "Witty",
      promptGuidanceForAI: "Be clever. ".repeat(60),
      color: "#222222",
      icon: "coffee",
      status: "active",
      version: 1,
    });
  });
  return t;
}

describe("checkEvalCandidates mirrors the save step", () => {
  test("an exact copy in the batch or library is a duplicate before the code checks run", () => {
    const library = "What would you bring to a desert island?";
    const checks = checkEvalCandidates(
      [
        "What's one  book you would bring to a desert island?",
        "What's one book you would bring to a desert island?",
        library,
        "Too short?",
        "Which song would you keep if you could keep only one?",
      ],
      new Set([fingerprintText(library)]),
    );

    expect(checks.map((check) => [check.outcome, check.duplicateOf])).toEqual([
      ["saved", null],
      ["duplicate", "batch"],
      ["duplicate", "library"],
      ["rejected", null],
      ["saved", null],
    ]);
    expect(checks[0].text).toBe("What's one book you would bring to a desert island?");
    expect(checks[3].codeRejections).toContain("too short");
  });

  test("a copy of a rejected question is a duplicate, and the library is checked before later batch copies", () => {
    const library = "What would you bring to a desert island?";
    const checks = checkEvalCandidates(
      ["Too short?", "Too  short?", ` ${library} `, library],
      new Set([fingerprintText(library)]),
    );

    expect(checks.map((check) => [check.outcome, check.duplicateOf])).toEqual([
      ["rejected", null],
      ["duplicate", "batch"],
      ["duplicate", "library"],
      ["duplicate", "batch"],
    ]);
    // Duplicates still carry their code rejections for the report.
    expect(checks[1].codeRejections).toContain("too short");
    expect(checks[2].fingerprint).toBe(fingerprintText(library));
    expect(evalFingerprint("  What would you   bring to a desert island? ")).toBe(fingerprintText(library));
  });

  test("agrees with insertGeneratedQuestions on the same batch", async () => {
    const t = await setup();
    const library = "What would you bring to a desert island?";
    const { styleId, toneId } = await t.run(async (ctx) => {
      await ctx.db.insert("questions", { text: library, fingerprint: fingerprintText(library), status: "public", ...counters });
      const style = await ctx.db
        .query("styles")
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      const tone = await ctx.db.query("tones").first();
      return { styleId: style!._id, toneId: tone!._id };
    });
    const texts = [
      "Which one book would you bring to a desert island?",
      "Which  one book would you bring to a desert island?",
      library,
      "Too short?",
      "Too short?",
      "What's your favorite color, and why do you like it?",
      "Which song would you keep if you could keep only one?",
    ];

    const fingerprints = texts.map(evalFingerprint);
    const matches = await t.query(internal.internal.evalData.libraryFingerprintMatches, { fingerprints });
    const checks = checkEvalCandidates(texts, new Set(fingerprints.filter((_, i) => matches[i] > 0)));
    const saved = await t.mutation(internal.internal.generation.insertGeneratedQuestions, {
      styleId,
      toneId,
      styleSlug: "desert-island",
      toneSlug: "witty",
      styleVersion: 2,
      toneVersion: 1,
      candidates: texts.map((text) => ({ text })),
    });
    const insertedTexts = await t.run(async (ctx) =>
      Promise.all(saved.insertedQuestionIds.map(async (id) => (await ctx.db.get(id))?.text)),
    );
    const duplicateKind: Record<string, string> = {
      "duplicate within batch": "batch",
      "duplicate of existing question": "library",
    };

    expect(checks.map((check) => check.outcome)).toEqual([
      "saved",
      "duplicate",
      "duplicate",
      "rejected",
      "duplicate",
      "rejected",
      "saved",
    ]);
    expect(checks.filter((check) => check.outcome === "saved").map((check) => check.text)).toEqual(insertedTexts);
    expect(
      checks.filter((check) => check.outcome === "duplicate").map((check) => [check.text, check.duplicateOf]),
    ).toEqual(saved.duplicates.map((duplicate) => [duplicate.text, duplicateKind[duplicate.reason] ?? duplicate.reason]));
    expect(
      checks.filter((check) => check.outcome === "rejected").map((check) => [check.text, check.codeRejections]),
    ).toEqual(saved.rejected.map((rejection) => [rejection.text, rejection.reasons]));
  });
});

describe("eval data", () => {
  test("library neighbours are only shared public questions", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym" });
      const userId = await ctx.db.insert("users", { email: "a@example.com", clerkId: "a" });
      const publicId = await ctx.db.insert("questions", { text: "Public?", status: "public", ...counters });
      const pruned = await ctx.db.insert("questions", { text: "Pruned?", status: "pruned", ...counters });
      const retired = await ctx.db.insert("questions", {
        text: "Retired?",
        status: "pruned",
        duplicateOf: publicId,
        duplicateWasPublic: true,
        ...counters,
      });
      const personal = await ctx.db.insert("questions", { text: "Mine?", authorId: userId, status: "public", ...counters });
      const team = await ctx.db.insert("questions", { text: "Team?", organizationId: orgId, status: "public", ...counters });
      const deleted = await ctx.db.insert("questions", { text: "Gone?", status: "public", ...counters });
      await ctx.db.delete(deleted);
      return [publicId, pruned, retired, personal, team, deleted];
    });

    const texts = await t.query(internal.internal.evalData.publicLibraryTexts, { questionIds: ids });

    expect(texts).toEqual(["Public?", null, null, null, null, null]);
  });

  test("fingerprint matches count existing copies, up to two", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("questions", { text: "Kept?", fingerprint: "q_kept", status: "pruned", ...counters });
      for (let i = 0; i < 3; i++) await ctx.db.insert("questions", { text: "Twin?", fingerprint: "q_twin", ...counters });
    });

    const matches = await t.query(internal.internal.evalData.libraryFingerprintMatches, {
      fingerprints: ["q_kept", "q_new", "q_twin"],
    });

    expect(matches).toEqual([1, 0, 2]);
  });

  test("definitions describe the exact versions a prompt used, and stay short", async () => {
    const t = await setup();
    const { styleId, toneId } = await t.run(async (ctx) => ({
      styleId: (await ctx.db.query("styles").filter((q) => q.eq(q.field("version"), 2)).first())!._id,
      toneId: (await ctx.db.query("tones").first())!._id,
    }));

    const definitions = await t.query(internal.internal.evalData.evalDefinitions, { styleId, toneId });

    expect(definitions.style).toEqual({
      slug: "desert-island",
      name: "Desert Island",
      definition: "Prioritization game. Structure: You can only bring ___.",
    });
    expect(definitions.tone.definition.length).toBeLessThanOrEqual(300);
    expect(definitions.tone.definition.endsWith("…")).toBe(true);
    expect(definitions.topic).toBeNull();
  });

  test("definitions use the fields the generator is given", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => ({
      styleId: await ctx.db.insert("styles", {
        id: "open-ended",
        slug: "open-ended",
        name: "Open Ended",
        structure: "Legacy structure.",
        structuralInstruction: "Ask one open question.",
        example: "Legacy example.",
        examples: [{ text: "What made you smile today?" }],
        color: "#333333",
        icon: "anchor",
        status: "active",
        version: 1,
      }),
      toneId: await ctx.db.insert("tones", {
        id: "cozy",
        slug: "cozy",
        name: "Cozy",
        description: "Warm and\n  unhurried.",
        aiGuidance: "Not this.",
        promptGuidanceForAI: "Nor this.",
        languageCues: ["soft", "homey"],
        color: "#444444",
        icon: "coffee",
        status: "active",
        version: 1,
      }),
      topicId: await ctx.db.insert("topics", {
        id: "food",
        slug: "food",
        name: "Food",
        description: "Cooking and eating.",
        scopeBoundaries: ["snacks", "recipes"],
        example: "Your go-to snack.",
        status: "active",
        version: 1,
      }),
    }));

    const definitions = await t.query(internal.internal.evalData.evalDefinitions, ids);

    expect(definitions).toEqual({
      style: { slug: "open-ended", name: "Open Ended", definition: "Structure: Ask one open question. Example: What made you smile today?" },
      tone: { slug: "cozy", name: "Cozy", definition: "Warm and unhurried. Sounds: soft, homey." },
      topic: { slug: "food", name: "Food", definition: "Cooking and eating. Covers: snacks, recipes." },
    });
  });

  test("definitions for a version that no longer exists fail", async () => {
    const t = await setup();
    const { styleId, toneId } = await t.run(async (ctx) => {
      const style = (await ctx.db.query("styles").first())!._id;
      const tone = (await ctx.db.query("tones").first())!._id;
      await ctx.db.delete(tone);
      return { styleId: style, toneId: tone };
    });

    const error = await t.query(internal.internal.evalData.evalDefinitions, { styleId, toneId }).catch((e: unknown) => e);
    expect(String(error)).toMatch(/no longer exists/);
    expect(classifyFailure(String(error))).toBe("setup");
  });

  test("every example in a definition is one the prompt showed the model", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("styles", {
        id: "open-ended",
        slug: "open-ended",
        name: "Open Ended",
        structure: "Ask anything.",
        example: "Legacy example the prompt never shows.",
        examples: [{ text: "What made you smile today?" }],
        color: "#333333",
        icon: "anchor",
        status: "active",
        version: 1,
      });
      await ctx.db.insert("topics", {
        id: "food",
        slug: "food",
        name: "Food",
        description: "Cooking and eating.",
        example: "Topic example the prompt never shows.",
        status: "active",
        version: 1,
      });
    });

    const prompt = await t.query(internal.internal.generation.buildGenerationPrompt, {
      styleSlug: "open-ended",
      toneSlug: "witty",
      topicSlug: "food",
      batchSize: 1,
    });
    const definitions = await t.query(internal.internal.evalData.evalDefinitions, {
      styleId: prompt.style._id,
      toneId: prompt.tone._id,
      topicId: prompt.topic?._id,
    });

    const examples = [definitions.style, definitions.tone, definitions.topic!].flatMap((d) =>
      [...d.definition.matchAll(/Example: (.+?)$/g)].map((match) => match[1]),
    );
    expect(examples).toEqual(["What made you smile today?"]);
    for (const example of examples) expect(`${prompt.systemPrompt}\n${prompt.userPrompt}`).toContain(example);
  });

  test("approved and legacy status-less questions are neighbours; held-for-review and textless ones are not", async () => {
    const t = await setup();
    const ids = await t.run(async (ctx) => [
      await ctx.db.insert("questions", { text: "Approved?", status: "approved", ...counters }),
      await ctx.db.insert("questions", { text: "Legacy?", ...counters }),
      await ctx.db.insert("questions", {
        text: "Held?",
        status: "pending",
        heldForReview: true,
        isAIGenerated: true,
        ...counters,
      }),
      await ctx.db.insert("questions", { status: "public", ...counters }),
    ]);

    const texts = await t.query(internal.internal.evalData.publicLibraryTexts, { questionIds: ids });

    expect(texts).toEqual(["Approved?", "Legacy?", null, null]);
  });
});

describe("generateEvalBatch", () => {
  test("reports what the save step would do and adds nothing to the library", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const text = "What would you bring to a desert island?";
      await ctx.db.insert("questions", { text, fingerprint: fingerprintText(text), status: "public", ...counters });
    });
    create.mockResolvedValue(
      completion(
        questionsJson(
          "Which one book would you bring to a desert island?",
          "What would you bring to a desert island?",
          "Too short?",
        ),
      ) as never,
    );

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s01",
      styleSlug: "desert-island",
      toneSlug: "witty",
      batchSize: 3,
      neighbours: 0,
    });

    expect(batch.style).toEqual({ slug: "desert-island", version: 2, name: "Desert Island" });
    expect(batch.temperature).toBe(0.9);
    expect(batch.candidates.map((c) => c.outcome)).toEqual(["saved", "duplicate", "rejected"]);
    expect(batch.candidates[1].duplicateOf).toBe("library");
    const { questions, run } = await t.run(async (ctx) => ({
      questions: await ctx.db.query("questions").collect(),
      run: await ctx.db.get(batch.runId),
    }));
    expect(questions).toHaveLength(1);
    expect(run?.purpose).toBe("admin_preview");
    expect(run?.requestedByUserId).toBe("eval:test:s01");
    const [system, user] = create.mock.calls[0][0].messages.map((message: { content: string }) => message.content);
    expect(batch.promptHash).toBe(createHash("sha256").update(`${system}\n\n${user}`).digest("hex").slice(0, 16));
    expect(batch.fingerprintCollisions).toBe(0);
  });

  test("neighbours are the closest shared public questions, each once, five by default", async () => {
    const t = await setup();
    const embedCreate = vi
      .spyOn(OpenAI.Embeddings.prototype, "create")
      .mockResolvedValue({ data: [{ embedding: atCosine(1) }] } as never);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "a@example.com", clerkId: "a" });
      const add = async (text: string, cosine: number, fields: Record<string, unknown> = {}, rows = 1) => {
        const questionId = await ctx.db.insert("questions", { text, status: "public", ...counters, ...fields });
        for (let i = 0; i < rows; i++) {
          await ctx.db.insert("question_embeddings", { questionId, embedding: atCosine(cosine) });
        }
        return questionId;
      };
      await add("Closest?", 1);
      await add("Mine?", 0.99, { authorId: userId });
      await add("Held?", 0.98, { status: "pending", heldForReview: true, isAIGenerated: true });
      await add("Twice?", 0.95, {}, 2);
      await ctx.db.delete(await add("Gone?", 0.93));
      await add("Third?", 0.9);
      await add("Fourth?", 0.8);
      await add("Fifth?", 0.7);
      await add("Sixth?", 0.6);
    });
    create.mockResolvedValue(completion(questionsJson("Which  one book would you bring to a desert island?")) as never);

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s01",
      styleSlug: "desert-island",
      toneSlug: "witty",
      batchSize: 1,
    });

    expect(embedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ input: "Which one book would you bring to a desert island?" }),
    );
    const [neighbours] = batch.candidates.map((candidate) => candidate.neighbours);
    expect(neighbours.map((neighbour) => neighbour.text)).toEqual(["Closest?", "Twice?", "Third?", "Fourth?", "Fifth?"]);
    expect(neighbours[0].cosine).toBeCloseTo(1);
    expect(neighbours[1].cosine).toBeCloseTo(0.95);
  });

  test("a topic seed reports its topic, uses the given temperature and is charged to the system budget", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("topics", {
        id: "food",
        slug: "food",
        name: "Food",
        description: "Cooking and eating.",
        status: "active",
        version: 3,
      });
      // Today's user budget is spent; admin tools and the eval are system spend.
      await ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "user", costUsd: 1, calls: 1 });
    });
    create.mockResolvedValue(
      completion(questionsJson("Which dish would you cook for a stranger on a desert island?")) as never,
    );

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s01",
      styleSlug: "desert-island",
      toneSlug: "witty",
      topicSlug: "food",
      batchSize: 1,
      temperature: 0.3,
      neighbours: 0,
    });

    expect(batch.topic).toEqual({ slug: "food", version: 3, name: "Food" });
    expect(batch.definitions.topic).toEqual({ slug: "food", name: "Food", definition: "Cooking and eating." });
    expect(batch.temperature).toBe(0.3);
    expect(create.mock.calls[0][0]).toMatchObject({ model: batch.model, temperature: 0.3 });
    expect(batch.blueprint).toEqual({ slug: DEFAULT_BLUEPRINT_SLUG, version: 1 });
    expect(batch.candidates).toEqual([
      {
        text: "Which dish would you cook for a stranger on a desert island?",
        outcome: "saved",
        duplicateOf: null,
        codeRejections: [],
        neighbours: [],
        neighbourError: null,
      },
    ]);
    const spend = await t.run((ctx) => ctx.db.query("aiSpendDays").collect());
    expect(spend.find((row) => row.spendClass === "user")?.costUsd).toBe(1);
    expect(spend.find((row) => row.spendClass === "system")?.calls).toBe(1);
  });

  test("a seed naming a missing style fails before anything is generated or charged", async () => {
    const t = await setup();

    await expect(
      t.action(internal.internal.evals.generateEvalBatch, {
        runLabel: "test",
        seedId: "s01",
        styleSlug: "no-such-style",
        toneSlug: "witty",
        batchSize: 1,
        neighbours: 0,
      }),
    ).rejects.toThrow(/No active styles entry/);
    expect(classifyFailure('Uncaught ConvexError: No active styles entry found for slug "no-such-style".')).toBe("setup");

    expect(create).not.toHaveBeenCalled();
    const { runs, spend } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("generationRuns").collect(),
      spend: await ctx.db.query("aiSpendDays").collect(),
    }));
    expect(runs).toEqual([]);
    expect(spend).toEqual([]);
  });
  test("refuses to run unless the deployment enables evals", async () => {
    const t = await setup();
    delete process.env.EVALS_ENABLED;

    await expect(
      t.action(internal.internal.evals.generateEvalBatch, {
        runLabel: "test",
        seedId: "s01",
        styleSlug: "desert-island",
        toneSlug: "witty",
        batchSize: 1,
        neighbours: 0,
      }),
    ).rejects.toThrow(/Evals are off/);
    const disabled = await t.query(internal.internal.evalData.evalLibraryStats, {}).catch((e: unknown) => e);
    expect(String(disabled)).toMatch(/Evals are off/);
    expect(classifyFailure(String(disabled))).toBe("setup");
    await expect(t.query(internal.internal.evalData.evalRunAttempts, { runLabel: "test", since: 0 })).rejects.toThrow(
      /Evals are off/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  test("every model call a batch made is on record, including the generator's own retry", async () => {
    const t = await setup();
    create
      .mockResolvedValueOnce(completion("not json") as never)
      .mockResolvedValueOnce(completion(questionsJson("Which one book would you bring to a desert island?")) as never);

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s07",
      styleSlug: "desert-island",
      toneSlug: "witty",
      batchSize: 1,
      neighbours: 0,
    });
    const attempts = await t.query(internal.internal.evalData.evalRunAttempts, { runLabel: "test", since: 0 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(attempts.map((attempt) => [attempt.seedId, attempt.status])).toEqual([
      ["s07", "failed"],
      ["s07", "succeeded"],
    ]);
    expect(attempts[0].error).toMatch(/could not be read/);
    expect(attempts[1].runId).toBe(batch.runId);
    expect(attempts[1].resolvedModel).toBe("anthropic/claude-haiku-5");
    expect(await t.query(internal.internal.evalData.evalRunAttempts, { runLabel: "other", since: 0 })).toEqual([]);
    const lastRun = await t.run((ctx) => ctx.db.get(batch.runId));
    expect(await t.query(internal.internal.evalData.evalRunAttempts, { runLabel: "test", since: lastRun!._creationTime })).toHaveLength(1);
    expect(await t.query(internal.internal.evalData.evalRunAttempts, { runLabel: "test", since: lastRun!._creationTime + 1 })).toEqual([]);
  });

  test("the search widens when held-for-review questions crowd out public neighbours", async () => {
    const t = await setup();
    vi.spyOn(OpenAI.Embeddings.prototype, "create").mockResolvedValue({ data: [{ embedding: atCosine(1) }] } as never);
    await t.run(async (ctx) => {
      for (let i = 0; i < 45; i++) {
        const questionId = await ctx.db.insert("questions", {
          text: `Held ${i}?`,
          status: "pending",
          heldForReview: true,
          isAIGenerated: true,
          ...counters,
        });
        await ctx.db.insert("question_embeddings", { questionId, embedding: atCosine(0.99) });
      }
      const publicId = await ctx.db.insert("questions", { text: "Public?", status: "public", ...counters });
      await ctx.db.insert("question_embeddings", { questionId: publicId, embedding: atCosine(0.5) });
    });
    create.mockResolvedValue(completion(questionsJson("Which one book would you bring to a desert island?")) as never);

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s01",
      styleSlug: "desert-island",
      toneSlug: "witty",
      batchSize: 1,
    });

    expect(batch.candidates[0].neighbours.map((neighbour) => neighbour.text)).toEqual(["Public?"]);
  });

  test("a failed neighbour search keeps the paid-for batch and says so", async () => {
    const t = await setup();
    vi.spyOn(OpenAI.Embeddings.prototype, "create").mockRejectedValue(new Error("embedding service down"));
    create.mockResolvedValue(completion(questionsJson("Which one book would you bring to a desert island?")) as never);

    const batch = await t.action(internal.internal.evals.generateEvalBatch, {
      runLabel: "test",
      seedId: "s01",
      styleSlug: "desert-island",
      toneSlug: "witty",
      batchSize: 1,
    });

    expect(batch.candidates[0].outcome).toBe("saved");
    expect(batch.candidates[0].neighbours).toEqual([]);
    expect(batch.candidates[0].neighbourError).toMatch(/embedding service down/);
  });

  test("the library snapshot counts shared public questions and how many can be searched", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "a@example.com", clerkId: "a" });
      const searchable = await ctx.db.insert("questions", { text: "Public?", status: "public", ...counters });
      await ctx.db.insert("question_embeddings", { questionId: searchable, embedding: atCosine(1) });
      await ctx.db.insert("questions", { text: "Not embedded yet?", status: "public", ...counters });
      await ctx.db.insert("questions", { text: "Mine?", authorId: userId, status: "public", ...counters });
      await ctx.db.insert("questions", { text: "Pruned?", status: "pruned", ...counters });
    });

    expect(await t.query(internal.internal.evalData.evalLibraryStats, {})).toEqual({ publicQuestions: 2, withEmbedding: 1 });
  });
});
