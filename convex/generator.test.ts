/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { openRouterClient } from "./lib/generationRunner";
import { GENERATOR_CALL_TIMEOUT_MS, GENERATOR_MAX_RUNNING, experimentName } from "./admin/generator";

const ADMIN = { subject: "admin", tokenIdentifier: "test|admin", metadata: { isAdmin: "true" } };
const READER = { subject: "reader", tokenIdentifier: "test|reader" };
const ENV_KEYS = ["QUALITY_CHECK_MODE", "AI_DAILY_BUDGET_USD", "AI_DAILY_HARD_CAP_USD"];
const base = { averageViewDuration: 0, totalLikes: 0, totalShows: 0 };
const OPUS = "anthropic/claude-opus-5.5";
const HAIKU = "anthropic/claude-haiku-5.5";

let create: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // Midday Pacific, so a test can't straddle the spend-day boundary.
  vi.setSystemTime(Date.UTC(2026, 10, 25, 19, 0));
  for (const key of ENV_KEYS) delete process.env[key];
  create = vi.spyOn(openRouterClient.chat.completions, "create").mockRejectedValue(new Error("unexpected provider call") as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

const completion = (content: string, model = HAIKU) => ({
  id: "cmpl-1",
  object: "chat.completion",
  created: 0,
  model,
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
  usage: { cost: 0.01 },
});
const questionsJson = (...texts: string[]) => JSON.stringify({ questions: texts.map((text) => ({ text })) });

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  await t.run(async (ctx) => {
    const style = { structure: "Ask", color: "#111", icon: "sparkles", status: "active" as const, version: 1 };
    const tone = { promptGuidanceForAI: "Be it", color: "#222", icon: "sun", status: "active" as const, version: 1 };
    await ctx.db.insert("styles", { id: "pick-one", slug: "pick-one", name: "Pick One", description: "Pick one of two.", ...style });
    await ctx.db.insert("styles", { id: "what-if", slug: "what-if", name: "What If", description: "Imagine.", ...style });
    await ctx.db.insert("styles", { id: "gone", slug: "gone", name: "Gone", description: "Old.", ...style, status: "archived" });
    await ctx.db.insert("tones", { id: "warm", slug: "warm", name: "Warm", ...tone });
    await ctx.db.insert("tones", { id: "bold", slug: "bold", name: "Bold", ...tone });
    await ctx.db.insert("topics", { id: "music", slug: "music", name: "Music", status: "active", version: 1 });
  });
  const admin = t.withIdentity(ADMIN);
  await admin.mutation(api.admin.generator.saveModel, { model: OPUS, label: "Opus" });
  await admin.mutation(api.admin.generator.saveModel, { model: HAIKU, label: "Haiku" });
  const calls = () => t.run((ctx) => ctx.db.query("generatorCalls").collect());
  return { t, admin, calls };
}

const twoByTwo = {
  cells: [
    { style: "pick-one", tone: "warm" },
    { style: "what-if", tone: "bold" },
  ],
  models: [OPUS, HAIKU],
  questionsPerCall: 2,
};

describe("saved models", () => {
  test("saves an OpenRouter id with a label, renames it when saved again, and removes it", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.generator.saveModel, { model: "openai/gpt-5", label: " GPT " });
    const id = await s.admin.mutation(api.admin.generator.saveModel, { model: "openai/gpt-5", label: "GPT-5" });
    const models = await s.admin.query(api.admin.generator.listModels, {});
    expect(models.map((m) => [m.model, m.label])).toEqual([[OPUS, "Opus"], [HAIKU, "Haiku"], ["openai/gpt-5", "GPT-5"]]);
    await s.admin.mutation(api.admin.generator.removeModel, { id });
    expect(await s.admin.query(api.admin.generator.listModels, {})).toHaveLength(2);
  });

  test("refuses what isn't a model id, and anyone but an admin", async () => {
    const s = await setup();
    await expect(s.admin.mutation(api.admin.generator.saveModel, { model: "GPT 5", label: "x" })).rejects.toThrow("isn't an OpenRouter model id");
    await expect(s.t.withIdentity(READER).mutation(api.admin.generator.saveModel, { model: "openai/gpt-5", label: "x" })).rejects.toThrow();
    await expect(s.t.withIdentity(READER).query(api.admin.generator.listModels, {})).rejects.toThrow();
  });
});

describe("createExperiment", () => {
  test("queues every cell for every model, names the run and gives the models shuffled blind labels", async () => {
    const s = await setup();
    const id = await s.admin.mutation(api.admin.generator.createExperiment, { ...twoByTwo, topicSlug: "music", direction: "  Summer songs  " });
    const experiment = await s.t.run((ctx) => ctx.db.get(id));
    expect(experiment).toMatchObject({ name: "Nov 25 · 2 cells · 2 models · Music", topicSlug: "music", direction: "Summer songs", questionsPerCall: 2 });
    expect(experiment!.models.map((m) => m.blindLabel)).toEqual(["Model A", "Model B"]);
    expect(experiment!.models.map((m) => m.model).sort()).toEqual([HAIKU, OPUS].sort());
    expect(experiment!.estimatedCostUsd).toBeGreaterThan(0);
    const calls = await s.calls();
    expect(calls.map((c) => `${c.style}|${c.tone}|${c.model}|${c.status}`).sort()).toEqual([
      `pick-one|warm|${HAIKU}|queued`, `pick-one|warm|${OPUS}|queued`, `what-if|bold|${HAIKU}|queued`, `what-if|bold|${OPUS}|queued`,
    ]);
  });

  test("names a run without a topic, and one cell or model in the singular", () => {
    expect(experimentName(Date.UTC(2026, 0, 3, 19), 1, 1)).toBe("Jan 3 · 1 cell · 1 model");
  });

  test("refuses a run it can't or shouldn't make", async () => {
    const s = await setup();
    const make = (extra: Partial<typeof twoByTwo> & { topicSlug?: string }) => s.admin.mutation(api.admin.generator.createExperiment, { ...twoByTwo, ...extra });
    await expect(make({ cells: [] })).rejects.toThrow("at least one cell");
    await expect(make({ models: [] })).rejects.toThrow("at least one model");
    await expect(make({ models: ["openai/gpt-5"] })).rejects.toThrow("Save \"openai/gpt-5\"");
    await expect(make({ cells: [{ style: "gone", tone: "warm" }] })).rejects.toThrow("No active style");
    await expect(make({ topicSlug: "nope" })).rejects.toThrow("No active topic");
    await expect(make({ questionsPerCall: 6 })).rejects.toThrow("1 to 5");
    const many = Array.from({ length: 51 }, (_, i) => ({ style: `s${i}`, tone: "warm" }));
    await expect(make({ cells: many })).rejects.toThrow("102 calls");
    await expect(s.t.withIdentity(READER).mutation(api.admin.generator.createExperiment, twoByTwo)).rejects.toThrow();
    expect(await s.calls()).toHaveLength(0);
  });

  test("refuses a run estimated at more than is left of today's budget", async () => {
    const s = await setup();
    process.env.AI_DAILY_HARD_CAP_USD = "0.05";
    await expect(s.admin.mutation(api.admin.generator.createExperiment, twoByTwo)).rejects.toThrow(/left of today's AI budget/);
  });
});

describe("running an experiment", () => {
  test("starts at most GENERATOR_MAX_RUNNING calls, and starts the next as each finishes", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.generator.createExperiment, {
      ...twoByTwo,
      cells: [...twoByTwo.cells, { style: "pick-one", tone: "bold" }],
    });
    await s.t.mutation(internal.admin.generator.pump, {});
    const running = (await s.calls()).filter((c) => c.status === "running");
    expect(running).toHaveLength(GENERATOR_MAX_RUNNING);
    expect((await s.calls()).filter((c) => c.status === "queued")).toHaveLength(6 - GENERATOR_MAX_RUNNING);

    await s.t.mutation(internal.admin.generator.finishCall, { callId: running[0]._id, status: "failed", error: "boom" });
    await s.t.mutation(internal.admin.generator.pump, {});
    expect((await s.calls()).filter((c) => c.status === "running")).toHaveLength(GENERATOR_MAX_RUNNING);
  });

  test("a call saves its questions for review, with the model it used, and asks Claude to check them", async () => {
    const s = await setup();
    const id = await s.admin.mutation(api.admin.generator.createExperiment, { ...twoByTwo, cells: [twoByTwo.cells[0]], models: [HAIKU], direction: "Summer" });
    await s.t.mutation(internal.admin.generator.pump, {});
    const [call] = await s.calls();
    create.mockResolvedValue(completion(questionsJson("Would you rather swim or hike?", "Which summer song takes you straight back to the beach?")) as never);
    await s.t.action(internal.admin.generator.runCall, { callId: call._id });

    expect(create.mock.calls[0][0]).toMatchObject({ model: HAIKU });
    const result = await s.admin.query(api.admin.generator.getExperiment, { id });
    const [{ call: done, questions }] = result!.calls;
    expect(done).toMatchObject({ status: "done", attempts: 1, duplicateCount: 0, rejectedCount: 0 });
    expect(questions.map((q) => [q.question.text, q.status, q.question.generatedByModel, q.question.heldForReview])).toEqual([
      ["Would you rather swim or hike?", "pending", HAIKU, true],
      ["Which summer song takes you straight back to the beach?", "pending", HAIKU, true],
    ]);
    const run = await s.t.run((ctx) => ctx.db.get(done.runId!));
    expect(run).toMatchObject({ purpose: "admin_experiment", model: HAIKU, batchSize: 2 });
    expect(run!.assembledPrompt).toContain("Summer");

    // QUALITY_CHECK_MODE is off, and the checks are queued anyway.
    const checks = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const forced = checks.filter((job) => job.name.includes("qualityCheck")).map((job) => job.args[0] as { force?: boolean });
    expect(forced).toEqual([{ questionId: questions[0].question._id, force: true }, { questionId: questions[1].question._id, force: true }]);
    // An admin experiment is system spend.
    const spend = await s.t.run((ctx) => ctx.db.query("aiSpendDays").collect());
    expect(spend.map((row) => row.spendClass)).toEqual(["system"]);
  });

  test("a failed call shows the provider's error, and Retry queues it again", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.generator.createExperiment, { ...twoByTwo, cells: [twoByTwo.cells[0]], models: [HAIKU] });
    await s.t.mutation(internal.admin.generator.pump, {});
    const [call] = await s.calls();
    create.mockRejectedValue(new Error("No endpoints found for anthropic/claude-haiku-5.5") as never);
    await s.t.action(internal.admin.generator.runCall, { callId: call._id });
    const [failed] = await s.calls();
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("No endpoints found");

    await s.admin.mutation(api.admin.generator.retryCall, { callId: call._id });
    const [queued] = await s.calls();
    expect(queued.status).toBe("queued");
    expect(queued.error).toBeUndefined();
    await expect(s.admin.mutation(api.admin.generator.retryCall, { callId: call._id })).rejects.toThrow("Only a failed call");
  });

  test("fails a call whose action died, so it frees its place", async () => {
    const s = await setup();
    await s.admin.mutation(api.admin.generator.createExperiment, { ...twoByTwo, cells: [twoByTwo.cells[0]], models: [HAIKU] });
    await s.t.mutation(internal.admin.generator.pump, {});
    vi.setSystemTime(Date.now() + GENERATOR_CALL_TIMEOUT_MS + 1);
    await s.t.mutation(internal.admin.generator.pump, {});
    expect((await s.calls())[0]).toMatchObject({ status: "failed", error: "The call timed out." });
  });
});

describe("getSetup", () => {
  test("counts library questions per cell, for the chosen topic only when there is one", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("questions", { ...base, text: "A?", status: "public", style: "pick-one", tone: "warm", topic: "music" });
      await ctx.db.insert("questions", { ...base, text: "B?", status: "approved", styleSlug: "pick-one", toneSlug: "warm" });
      await ctx.db.insert("questions", { ...base, text: "C?", status: "pending", style: "pick-one", tone: "warm" });
      await ctx.db.insert("questions", { ...base, text: "D?", status: "pruned", prunedAt: 1, style: "what-if", tone: "bold" });
    });
    const all = await s.admin.query(api.admin.generator.getSetup, {});
    expect(all.coverage).toEqual({ "pick-one|warm": 2 });
    expect(all.budget).toMatchObject({ spentUsd: 0, hardCapUsd: 5, leftUsd: 5 });
    expect((await s.admin.query(api.admin.generator.getSetup, { topicSlug: "music" })).coverage).toEqual({ "pick-one|warm": 1 });
  });
});

describe("forced quality check", () => {
  test("judges and saves a verdict with the check switched off", async () => {
    const s = await setup();
    const questionId: Id<"questions"> = await s.t.run(async (ctx) => {
      const styleId = (await ctx.db.query("styles").first())!._id;
      const toneId = (await ctx.db.query("tones").first())!._id;
      return ctx.db.insert("questions", {
        ...base, text: "Beach or pool?", status: "pending", heldForReview: true, isAIGenerated: true,
        style: "pick-one", tone: "warm", styleId, toneId,
      });
    });
    const verdict = { verdict: "keep", reasons: [], safety: [], confidence: 5, note: "Fine." };
    create.mockResolvedValue(completion(JSON.stringify(verdict), OPUS) as never);
    expect(await s.t.action(internal.internal.qualityCheck.checkQuestion, { questionId })).toBe("skipped");
    expect(await s.t.action(internal.internal.qualityCheck.checkQuestion, { questionId, force: true })).toBe("checked");
    expect((await s.t.run((ctx) => ctx.db.get(questionId)))?.qualityCheck?.verdict).toBe("keep");
  });
});
