/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { QUALITY_CHECK_BACKFILL_LIMIT, QUALITY_CHECK_RETRY_DELAY_MS } from "./internal/qualityCheck";
import { spendDay } from "./lib/aiSpend";
import { openRouterClient } from "./lib/generationRunner";
import { DEFAULT_BLUEPRINT_SLUG } from "./lib/promptArchitecture";
import {
  QUALITY_CHECK_MODEL,
  QUALITY_CHECK_PROMPT_VERSION,
  buildQualityCheckPrompts,
  parseQualityVerdict,
  qualityCheckMode,
  wouldPublish,
  type QualityVerdict,
} from "./lib/qualityCheck";

const ENV_KEYS = ["QUALITY_CHECK_MODE", "EVALS_ENABLED", "AI_DAILY_BUDGET_USD", "AI_DAILY_HARD_CAP_USD"];
const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
const KEEP: QualityVerdict = { verdict: "keep", reasons: [], safety: [], confidence: 5, note: "Clear and easy to answer." };
const HOLD: QualityVerdict = { verdict: "hold", reasons: ["awkward_wording"], safety: ["humiliation"], confidence: 4, note: "Stiff phrasing." };

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Scheduled embedding and check jobs stay queued until a test runs one itself.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // Midday Pacific, so a test can't straddle the spend-day boundary.
  vi.setSystemTime(Date.UTC(2026, 9, 6, 19, 0));
  for (const key of ENV_KEYS) delete process.env[key];
  create = vi.spyOn(openRouterClient.chat.completions, "create");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

function completion(content: string, usage: Record<string, unknown> = { cost: 0.006 }) {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    created: 0,
    model: QUALITY_CHECK_MODEL,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage,
  };
}
const answers = (verdict: QualityVerdict) => create.mockResolvedValue(completion(JSON.stringify(verdict)) as never);

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const styleId = await ctx.db.insert("styles", {
      id: "reflective",
      slug: "reflective",
      name: "Reflective",
      description: "Looks back on something small.",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
    });
    const toneId = await ctx.db.insert("tones", {
      id: "warm",
      slug: "warm",
      name: "Warm",
      promptGuidanceForAI: "Be warm",
      color: "#222222",
      icon: "sun",
    });
    return { styleId, toneId };
  });
  return { t, ...ids };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** A generated question as the save step leaves it: held for review unless a status is given. */
function generated(s: Setup, fields: Partial<Doc<"questions">> = {}) {
  return s.t.run((ctx) =>
    ctx.db.insert("questions", {
      text: "What small thing made you smile today?",
      isAIGenerated: true,
      source: "ai",
      styleId: s.styleId,
      toneId: s.toneId,
      style: "reflective",
      tone: "warm",
      status: "pending",
      heldForReview: true,
      safetyFlags: [],
      quality: {},
      ...counters,
      ...fields,
    }),
  );
}

const question = (s: Setup, questionId: Id<"questions">) => s.t.run((ctx) => ctx.db.get(questionId));
const runs = (s: Setup) => s.t.run((ctx) => ctx.db.query("generationRuns").collect());
const spend = async (s: Setup) =>
  (await s.t.run((ctx) => ctx.db.query("aiSpendDays").collect())).map((row) => [row.spendClass, row.costUsd, row.calls]);
/** Checks waiting to run, as [question, attempt, minutes from now]. */
async function queuedChecks(s: Setup) {
  const scheduled = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return scheduled
    .filter((job) => job.name.includes("qualityCheck") && job.state.kind === "pending")
    .map((job) => {
      const args = job.args[0] as { questionId: Id<"questions">; attempt?: number };
      return [args.questionId, args.attempt ?? 1, Math.round((job.scheduledTime - Date.now()) / 60_000)];
    });
}
const check = (s: Setup, questionId: Id<"questions">, attempt?: number) =>
  s.t.action(internal.internal.qualityCheck.checkQuestion, { questionId, attempt });

function save(s: Setup, texts: string[], status?: "pending") {
  return s.t.mutation(internal.internal.generation.insertGeneratedQuestions, {
    styleId: s.styleId,
    toneId: s.toneId,
    styleSlug: "reflective",
    toneSlug: "warm",
    styleVersion: 1,
    toneVersion: 1,
    candidates: texts.map((text) => ({ text, rationale: "The generator's own reasoning." })),
    status,
  });
}

describe("the publish rule and the answer parser", () => {
  test("only a keep with no reasons, no safety flags and the top confidence would publish", () => {
    expect(wouldPublish(KEEP)).toBe(true);
    expect(wouldPublish({ ...KEEP, confidence: 4 })).toBe(false);
    expect(wouldPublish({ ...KEEP, confidence: 3 })).toBe(false);
    expect(wouldPublish({ ...KEEP, reasons: ["unclear_answer"] })).toBe(false);
    expect(wouldPublish({ ...KEEP, safety: ["trauma"] })).toBe(false);
    expect(wouldPublish({ ...HOLD, reasons: [], safety: [], confidence: 5 })).toBe(false);
  });

  test("a well-formed answer is read, with repeats dropped, the note trimmed to 200 characters and a code fence ignored", () => {
    expect(parseQualityVerdict(JSON.stringify(KEEP))).toEqual(KEEP);
    const noisy = { ...HOLD, reasons: ["awkward_wording", "awkward_wording", "unclear_answer"], note: ` ${"x".repeat(250)} `, extra: true };
    expect(parseQualityVerdict(`\`\`\`json\n${JSON.stringify(noisy)}\n\`\`\``)).toEqual({
      ...HOLD,
      reasons: ["awkward_wording", "unclear_answer"],
      note: "x".repeat(200),
    });
  });

  test.each([
    ["not JSON", "The question is fine."],
    ["a list", "[]"],
    ["an unknown verdict", JSON.stringify({ ...KEEP, verdict: "approve" })],
    ["an unknown reason", JSON.stringify({ ...HOLD, reasons: ["too_long"] })],
    ["an unknown safety category", JSON.stringify({ ...HOLD, safety: ["violence"] })],
    ["reasons that aren't a list", JSON.stringify({ ...HOLD, reasons: "awkward_wording" })],
    ["a confidence of 0", JSON.stringify({ ...KEEP, confidence: 0 })],
    ["a confidence of 6", JSON.stringify({ ...KEEP, confidence: 6 })],
    ["a fractional confidence", JSON.stringify({ ...KEEP, confidence: 4.5 })],
    ["a missing note", JSON.stringify({ ...KEEP, note: undefined })],
  ])("%s is not a verdict", (_what, raw) => {
    expect(parseQualityVerdict(raw)).toBeNull();
  });

  test("the judge is shown the question and what it was asked to be, never the generator's rationale", () => {
    const style = { slug: "reflective", name: "Reflective", definition: "Looks back." };
    const tone = { slug: "warm", name: "Warm", definition: "Kind." };
    const withTopic = buildQualityCheckPrompts({ text: "What made you smile?", style, tone, topic: { slug: "food", name: "Food", definition: "Meals." } });
    expect(withTopic.userPrompt).toBe("Style: Reflective\nLooks back.\n\nTone: Warm\nKind.\n\nTopic: Food. Meals.\n\nQuestion:\nWhat made you smile?");
    expect(buildQualityCheckPrompts({ text: "Q?", style, tone, topic: null }).userPrompt).toContain("Topic: none");
    expect(withTopic.systemPrompt).toContain("awkward_wording, unclear_answer, style_tone_mismatch, repeated_construction");
    expect(withTopic.systemPrompt).toContain("trauma, targets_person, sexual_illegal, politics_religion, humiliation");
  });

  test("the mode is off unless it is set to record or publish", () => {
    expect(qualityCheckMode()).toBe("off");
    for (const [value, mode] of [["record", "record"], [" publish ", "publish"], ["on", "off"], ["", "off"]] as const) {
      process.env.QUALITY_CHECK_MODE = value;
      expect(qualityCheckMode()).toBe(mode);
    }
  });
});

describe("scheduling a check when a question is saved", () => {
  test("with the mode off, saving a question schedules no check", async () => {
    const s = await setup();
    await save(s, ["What small thing made you smile today?"], "pending");
    expect(await queuedChecks(s)).toEqual([]);
  });

  test("in record mode every saved question gets a check, held for review or published at once", async () => {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    // Feed and daily-email questions are saved pending; matrix fill and the nightly pool publish.
    const held = await save(s, ["What small thing made you smile today?", "Which smell takes you back to childhood?"], "pending");
    const published = await save(s, ["What chore do you secretly enjoy?"]);

    const saved = [...held.insertedQuestionIds, ...published.insertedQuestionIds];
    expect(await queuedChecks(s)).toEqual(saved.map((questionId) => [questionId, 1, 0]));
    // Saving itself decided nothing: the statuses are what the callers asked for.
    expect((await Promise.all(saved.map((id) => question(s, id)))).map((q) => [q?.status, q?.heldForReview, q?.qualityCheck])).toEqual([
      ["pending", true, undefined],
      ["pending", true, undefined],
      ["public", undefined, undefined],
    ]);
  });

  test("a duplicate or rejected candidate is never saved, so it is never checked", async () => {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    const result = await save(s, ["What small thing made you smile today?", "What small thing made you smile today?"], "pending");
    expect(result.insertedCount).toBe(1);
    expect(await queuedChecks(s)).toHaveLength(1);
  });
});

describe("checking a question in record mode", () => {
  beforeEach(() => {
    process.env.QUALITY_CHECK_MODE = "record";
  });

  test("a verdict is saved on the question with its run and cost, and nothing else about the question changes", async () => {
    const s = await setup();
    const questionId = await generated(s, { reviewRevision: 2 });
    answers(HOLD);

    expect(await check(s, questionId)).toBe("checked");

    const checked = await question(s, questionId);
    expect(checked?.qualityCheck).toEqual({
      ...HOLD,
      wouldPublish: false,
      model: QUALITY_CHECK_MODEL,
      promptVersion: QUALITY_CHECK_PROMPT_VERSION,
      runId: expect.any(String),
      checkedAt: Date.now(),
    });
    // The existing safety field mirrors the check's own list.
    expect(checked?.safetyFlags).toEqual(["humiliation"]);
    expect(checked).toMatchObject({ status: "pending", heldForReview: true, reviewRevision: 2, text: "What small thing made you smile today?" });

    const [run] = await runs(s);
    expect(run._id).toBe(checked?.qualityCheck?.runId);
    expect(run).toMatchObject({
      purpose: "quality_check",
      status: "succeeded",
      model: QUALITY_CHECK_MODEL,
      sourceQuestionId: questionId,
      costUsd: 0.006,
      styleSlug: "reflective",
      toneSlug: "warm",
      batchSize: 1,
      temperature: 0,
    });
    expect(run.blueprintId).toBeUndefined();
    // Charged to system spend, whoever's request generated the question.
    expect(await spend(s)).toEqual([["system", 0.006, 1]]);
  });

  test("the provider is asked once, with room for the model's reasoning, and shown the question and its style and tone but not the rationale", async () => {
    const s = await setup();
    const questionId = await generated(s, { moderationNotes: "The generator's own reasoning." });
    answers(KEEP);

    await check(s, questionId);

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0] as { model: string; max_tokens: number; temperature: number; messages: Array<{ content: string }> };
    expect(params).toMatchObject({ model: QUALITY_CHECK_MODEL, max_tokens: 1200, temperature: 0, response_format: { type: "json_object" } });
    const prompt = params.messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("Question:\nWhat small thing made you smile today?");
    expect(prompt).toContain("Style: Reflective\nLooks back on something small. Structure: Ask for a reflection");
    expect(prompt).toContain("Tone: Warm\nBe warm");
    expect(prompt).not.toContain("The generator's own reasoning.");
    expect((await question(s, questionId))?.qualityCheck).toMatchObject({ verdict: "keep", wouldPublish: true });
  });

  test("a question published at once keeps its status whatever the verdict", async () => {
    const s = await setup();
    const questionId = await generated(s, { status: "public", heldForReview: undefined });
    answers(HOLD);

    await check(s, questionId);

    expect(await question(s, questionId)).toMatchObject({ status: "public", qualityCheck: { verdict: "hold", wouldPublish: false } });
  });

  test.each([
    ["an unreadable answer", () => create.mockResolvedValue(completion("I think this one is fine.") as never)],
    ["a reason outside the list", () => create.mockResolvedValue(completion(JSON.stringify({ ...HOLD, reasons: ["too_long"] })) as never)],
    ["a provider refusal", () => create.mockRejectedValue(new Error("400 invalid request") as never)],
  ])("%s leaves the question as it was and schedules one retry", async (_what, fail) => {
    const s = await setup();
    const questionId = await generated(s);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fail();

    expect(await check(s, questionId)).toBe("failed");

    expect(await question(s, questionId)).toMatchObject({ status: "pending", heldForReview: true, safetyFlags: [] });
    expect((await question(s, questionId))?.qualityCheck).toBeUndefined();
    expect((await runs(s)).map((run) => [run.purpose, run.status])).toEqual([["quality_check", "failed"]]);
    expect(await queuedChecks(s)).toEqual([[questionId, 2, QUALITY_CHECK_RETRY_DELAY_MS / 60_000]]);
  });

  test("a second failure schedules nothing more", async () => {
    const s = await setup();
    const questionId = await generated(s);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockResolvedValue(completion("Not JSON.") as never);

    expect(await check(s, questionId, 2)).toBe("failed");

    expect(await queuedChecks(s)).toEqual([]);
    expect((await question(s, questionId))?.qualityCheck).toBeUndefined();
  });

  test("with the daily hard cap reached the check is refused before any call, and is retried later", async () => {
    process.env.AI_DAILY_HARD_CAP_USD = "1";
    const s = await setup();
    await s.t.run((ctx) => ctx.db.insert("aiSpendDays", { day: spendDay(Date.now()), spendClass: "system", costUsd: 1, calls: 3 }));
    const questionId = await generated(s);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await check(s, questionId)).toBe("failed");

    expect(create).not.toHaveBeenCalled();
    expect(await runs(s)).toEqual([]);
    expect(await spend(s)).toEqual([["system", 1, 3]]);
    expect(await queuedChecks(s)).toEqual([[questionId, 2, 5]]);
  });

  test("a question that already has a verdict, was written by a person, was retired or is gone is skipped without a call", async () => {
    const s = await setup();
    const checked = await generated(s);
    answers(KEEP);
    await check(s, checked);
    create.mockClear();
    const personal = await generated(s, { authorId: "author-1", text: "My own question?" });
    const team = await generated(s, { kind: "team_prompt", text: "Our team's question?" });
    const submitted = await generated(s, { isAIGenerated: undefined, text: "Sent in by a visitor?" });
    const retired = await generated(s, { status: "pruned", prunedAt: 5, text: "Retired last week?" });
    const gone = await generated(s, { text: "Deleted a moment ago?" });
    await s.t.run((ctx) => ctx.db.delete(gone));

    for (const questionId of [checked, personal, team, submitted, retired, gone]) {
      expect(await check(s, questionId), questionId).toBe("skipped");
    }

    expect(create).not.toHaveBeenCalled();
    expect(await queuedChecks(s)).toEqual([]);
  });

  test("a check that finishes after another already saved a verdict leaves the first verdict in place", async () => {
    const s = await setup();
    const questionId = await generated(s);
    create.mockImplementation((async () => {
      // Another check lands while this one is waiting on the provider.
      const runId = await s.t.mutation(internal.internal.generation.createGenerationRun, {
        purpose: "quality_check", batchSize: 1, model: QUALITY_CHECK_MODEL, temperature: 0, assembledPrompt: "", sourceQuestionId: questionId,
      });
      await s.t.mutation(internal.internal.qualityCheckData.saveQualityCheck, {
        questionId, verdict: HOLD, model: QUALITY_CHECK_MODEL, promptVersion: QUALITY_CHECK_PROMPT_VERSION, runId,
      });
      return completion(JSON.stringify(KEEP));
    }) as never);

    await check(s, questionId);

    expect((await question(s, questionId))?.qualityCheck).toMatchObject({ verdict: "hold" });
  });

  test("with the mode switched off, a check that was already queued does nothing", async () => {
    const s = await setup();
    const questionId = await generated(s);
    process.env.QUALITY_CHECK_MODE = "off";

    expect(await check(s, questionId)).toBe("skipped");

    expect(create).not.toHaveBeenCalled();
    expect((await question(s, questionId))?.qualityCheck).toBeUndefined();
  });
});

describe("the four ways a question is generated, in record mode", () => {
  const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
  const ADMIN = { subject: "admin-clerk", tokenIdentifier: "test|admin-clerk", email: "admin@example.com", metadata: { isAdmin: "true" } };
  const generates = (text: string) =>
    create.mockResolvedValue(completion(JSON.stringify({ questions: [{ text }] }), { cost: 0.01 }) as never);

  async function app() {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    const ids = await s.t.run(async (ctx) => {
      await ctx.db.insert("promptBlueprints", {
        slug: DEFAULT_BLUEPRINT_SLUG,
        version: 1,
        status: "active",
        systemInstruction: "",
        safetyChecklist: [],
        qualityChecklist: [],
        outputFormatInstruction: "",
        createdAt: 0,
        updatedAt: 0,
      });
      const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
      return { meId };
    });
    return { ...s, ...ids };
  }
  /** The one generated question, and the checks queued for it. */
  async function outcome(s: Setup) {
    const [saved] = (await s.t.run((ctx) => ctx.db.query("questions").collect())).filter((q) => q.isAIGenerated);
    return { saved, checks: await queuedChecks(s) };
  }
  const reviewQueue = async (s: Setup) =>
    (await s.t.withIdentity(ADMIN).query(api.admin.questions.getPendingQuestions, {})).map((q: Doc<"questions">) => q._id);

  test("a feed question is held for review as before, and its check is queued, not run in the request", async () => {
    const s = await app();
    generates("What small win are you proud of this week?");

    await s.t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: s.styleId, anchoredToneId: s.toneId });

    const { saved, checks } = await outcome(s);
    expect(saved).toMatchObject({ status: "pending", heldForReview: true });
    expect(saved.qualityCheck).toBeUndefined();
    expect(checks).toEqual([[saved._id, 1, 0]]);
    // Only the generation call was made while the person waited.
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("a daily-email question is held for review as before, with a check queued", async () => {
    const s = await app();
    generates("Which song do you skip every single time?");

    await s.t.action(internal.internal.ai.generateAIQuestionForUser, {
      userId: s.meId,
      bypassAIUsage: true,
      purpose: "newsletter",
      anchoredStyleId: s.styleId,
      anchoredToneId: s.toneId,
    });

    const { saved, checks } = await outcome(s);
    expect(saved).toMatchObject({ status: "pending", heldForReview: true });
    expect(checks).toEqual([[saved._id, 1, 0]]);
  });

  test("a matrix fill's question is public at once and never enters the owner's queue, whatever the verdict", async () => {
    const s = await app();
    const organizationId = await s.t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      await ctx.db.insert("organization_members", { userId: s.meId, organizationId: orgId, role: "manager" });
      await ctx.db.insert("styles", { id: "s1", slug: "s1", status: "active", version: 1, name: "s1", structure: "x", color: "#111111", icon: "sparkles" });
      await ctx.db.insert("tones", { id: "t1", slug: "t1", status: "active", version: 1, name: "t1", promptGuidanceForAI: "x", color: "#222222", icon: "sun" });
      await ctx.db.insert("topics", { id: "any-topic", slug: "any-topic", status: "active", version: 1, name: "Any" });
      return orgId;
    });
    generates("What chore do you secretly enjoy doing?");

    await s.t.withIdentity(ME).action(api.core.fillMatrix.fillSingleCell, { organizationId, styleSlug: "s1", toneSlug: "t1", topicSlug: "any-topic" });

    const { saved, checks } = await outcome(s);
    expect(saved.status).toBe("public");
    expect(saved.heldForReview).toBeUndefined();
    expect(checks).toEqual([[saved._id, 1, 0]]);

    answers(HOLD);
    await check(s, saved._id);

    // The team's managers see the flag on their grid; the owner's queue stays empty.
    expect(await question(s, saved._id)).toMatchObject({ status: "public", qualityCheck: { verdict: "hold" } });
    expect(await reviewQueue(s)).toEqual([]);
    const grid = await s.t.query(api.core.questions.getPublicQuestions, {});
    expect(grid.find((row) => row._id === saved._id)?.claudeFlag).toEqual({ reasons: ["awkward_wording"], safety: ["humiliation"], note: "Stiff phrasing." });
  });

  test("a nightly-pool question is public at once as before, with a check queued", async () => {
    const s = await app();
    await s.t.run((ctx) => ctx.db.insert("users", { email: "reader@example.com", clerkId: "reader-clerk", newsletterSubscriptionStatus: "subscribed" }));
    generates("What habit would you keep if you moved abroad?");

    await s.t.action(internal.internal.ai.generateNightlyQuestionPool, { targetCount: 1, maxCombinations: 1 });

    const { saved, checks } = await outcome(s);
    expect(saved).toMatchObject({ status: "public", poolStatus: "available" });
    expect(saved.heldForReview).toBeUndefined();
    expect(checks).toEqual([[saved._id, 1, 0]]);
  });

  test("with the mode off, none of this happens: a feed question is saved and no check is queued", async () => {
    const s = await app();
    process.env.QUALITY_CHECK_MODE = "off";
    generates("What small win are you proud of this week?");

    await s.t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, { anchoredStyleId: s.styleId, anchoredToneId: s.toneId });

    const { saved, checks } = await outcome(s);
    expect(saved).toMatchObject({ status: "pending", heldForReview: true });
    expect(checks).toEqual([]);
    expect((await runs(s)).map((run) => run.purpose)).toEqual(["feed"]);
  });
});

describe("the backfill", () => {
  const backfill = (s: Setup, dryRun: boolean) => s.t.action(internal.internal.qualityCheck.checkPendingQuestions, { dryRun });

  test("a dry run lists the held questions with no verdict, oldest first, and writes nothing", async () => {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    const first = await generated(s, { text: "First in the queue?" });
    const second = await generated(s, { text: "Second in the queue?" });
    // Not held for the owner, or not waiting at all: none of these belong to the backfill.
    await generated(s, { text: "Published by a fill?", status: "public", heldForReview: undefined });
    await generated(s, { text: "Moved to pending by an admin?", heldForReview: undefined });
    await generated(s, { text: "Sent in by a visitor?", isAIGenerated: undefined, heldForReview: undefined });

    expect(await backfill(s, true)).toEqual({ questionIds: [first, second], checked: 0, skipped: 0, failed: 0 });

    expect(create).not.toHaveBeenCalled();
    expect((await question(s, first))?.qualityCheck).toBeUndefined();
  });

  test("a real run checks them, counts a failure, and a second run picks up what failed", async () => {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    const first = await generated(s, { text: "First in the queue?" });
    const second = await generated(s, { text: "Second in the queue?" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    create
      .mockResolvedValueOnce(completion(JSON.stringify(KEEP)) as never)
      .mockResolvedValueOnce(completion("Not JSON.") as never)
      .mockResolvedValue(completion(JSON.stringify(HOLD)) as never);

    expect(await backfill(s, false)).toEqual({ questionIds: [first, second], checked: 1, skipped: 0, failed: 1 });
    // The backfill doesn't queue retries of its own: it is the retry.
    expect(await queuedChecks(s)).toEqual([]);
    expect(await backfill(s, false)).toEqual({ questionIds: [second], checked: 1, skipped: 0, failed: 0 });

    expect((await question(s, first))?.qualityCheck?.verdict).toBe("keep");
    expect((await question(s, second))?.qualityCheck?.verdict).toBe("hold");
    expect(await backfill(s, true)).toMatchObject({ questionIds: [] });
  });

  test("it checks at most the limit in one run", async () => {
    process.env.QUALITY_CHECK_MODE = "record";
    const s = await setup();
    for (let i = 0; i < QUALITY_CHECK_BACKFILL_LIMIT + 3; i++) await generated(s, { text: `Waiting question number ${i}?` });

    expect((await backfill(s, true)).questionIds).toHaveLength(QUALITY_CHECK_BACKFILL_LIMIT);
  });

  test("a real run is refused while the mode is off", async () => {
    const s = await setup();
    await generated(s);

    await expect(backfill(s, false)).rejects.toThrow(/QUALITY_CHECK_MODE is off on this deployment\. Nothing was checked\./);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("the check for measuring against labels", () => {
  const style = { slug: "reflective", name: "Reflective", definition: "Looks back." };
  const tone = { slug: "warm", name: "Warm", definition: "Kind." };
  const items = [
    { text: "What small thing made you smile today?", style, tone, topic: null },
    { text: "Which smell takes you back to childhood?", style, tone, topic: { slug: "food", name: "Food", definition: "Meals." } },
  ];
  const evaluate = (s: Setup, list = items) => s.t.action(internal.internal.qualityCheck.evalQualityCheck, { items: list });

  test("it is refused where evals aren't enabled", async () => {
    const s = await setup();
    await expect(evaluate(s)).rejects.toThrow(/Evals are off on this deployment/);
    expect(create).not.toHaveBeenCalled();
  });

  test("it returns a verdict for each text, reports one that couldn't be judged, and saves nothing on any question", async () => {
    process.env.EVALS_ENABLED = "true";
    const s = await setup();
    const existing = await generated(s);
    create
      .mockResolvedValueOnce(completion(JSON.stringify(KEEP)) as never)
      .mockResolvedValueOnce(completion("Not JSON.") as never);

    expect(await evaluate(s)).toEqual({
      model: QUALITY_CHECK_MODEL,
      promptVersion: QUALITY_CHECK_PROMPT_VERSION,
      results: [
        { text: items[0].text, verdict: KEEP, wouldPublish: true },
        { text: items[1].text, error: "The quality check's answer couldn't be read" },
      ],
    });

    expect((await question(s, existing))?.qualityCheck).toBeUndefined();
    // Each call is still recorded and paid for like any other.
    expect((await runs(s)).map((run) => [run.purpose, run.status, run.sourceQuestionId])).toEqual([
      ["quality_check", "succeeded", undefined],
      ["quality_check", "failed", undefined],
    ]);
  });

  test("more than 25 texts in one call are refused", async () => {
    process.env.EVALS_ENABLED = "true";
    const s = await setup();
    await expect(evaluate(s, Array.from({ length: 26 }, () => items[0]))).rejects.toThrow(/Pass at most 25 questions a call/);
  });
});

describe("the flag on the schedule grid", () => {
  test("a question the check would hold carries its reasons and note; a keep or an unchecked question carries nothing", async () => {
    const s = await setup();
    const runId = await s.t.mutation(internal.internal.generation.createGenerationRun, {
      purpose: "quality_check", batchSize: 1, model: QUALITY_CHECK_MODEL, temperature: 0, assembledPrompt: "",
    });
    const stamp = { model: QUALITY_CHECK_MODEL, promptVersion: 1, runId, checkedAt: 1 };
    const held = await generated(s, { text: "Flagged one?", status: "public", heldForReview: undefined, qualityCheck: { ...HOLD, wouldPublish: false, ...stamp } });
    const kept = await generated(s, { text: "Kept one?", status: "public", heldForReview: undefined, qualityCheck: { ...KEEP, wouldPublish: true, ...stamp } });
    const unchecked = await generated(s, { text: "Unchecked one?", status: "public", heldForReview: undefined });

    const pool = await s.t.query(api.core.questions.getPublicQuestions, {});

    expect(pool.map((row) => [row._id, row.claudeFlag])).toEqual([
      [held, { reasons: ["awkward_wording"], safety: ["humiliation"], note: "Stiff phrasing." }],
      [kept, undefined],
      [unchecked, undefined],
    ]);
  });
});
