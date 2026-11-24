/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { APIError } from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { InterruptedStreamError, openRouterClient, streamChatCompletion } from "./lib/generationRunner";
import schema from "./schema";

const ME = { subject: "me-clerk", tokenIdentifier: "test|me-clerk", email: "me@example.com" };
const OTHER = { subject: "other-clerk", tokenIdentifier: "test|other-clerk", email: "other@example.com" };
const KEY = "6f1b7c1e-3d3a-4f55-9a53-0c1f7f4e2b10";
const SECRET_REASONING = "private reasoning that must not be stored";
const ANSWER = JSON.stringify({ questions: [{ text: "Which smell takes you straight back to childhood?" }] });
const PARAMS = { model: "anthropic/claude-opus-5.5", messages: [{ role: "user" as const, content: "Hi" }] };

type Chunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{ index: number; delta: Record<string, unknown>; finish_reason: string | null }>;
  usage?: Record<string, unknown>;
};

const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null): Chunk => ({
  id: "cmpl-1",
  object: "chat.completion.chunk",
  created: 1,
  model: "anthropic/claude-opus-5.5",
  choices: [{ index: 0, delta, finish_reason }],
});
const usageChunk = (cost: number): Chunk => ({
  ...chunk({}),
  choices: [],
  usage: { cost, prompt_tokens: 100, completion_tokens: 50 },
});
const fullStream = () => [
  chunk({ role: "assistant", reasoning: SECRET_REASONING }),
  chunk({ content: ANSWER.slice(0, 20) }),
  chunk({ content: ANSWER.slice(20) }),
  chunk({}, "stop"),
  usageChunk(0.015),
];

async function* streamOf(chunks: Chunk[], failure?: Error) {
  for (const item of chunks) yield item;
  if (failure) throw failure;
}

let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 23, 19, 0));
  create = vi.spyOn(openRouterClient.chat.completions, "create");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const meId = await ctx.db.insert("users", { email: ME.email, clerkId: ME.subject });
    const otherId = await ctx.db.insert("users", { email: OTHER.email, clerkId: OTHER.subject });
    const styleId = await ctx.db.insert("styles", {
      id: "reflective",
      name: "Reflective",
      structure: "Ask for a reflection",
      color: "#111111",
      icon: "sparkles",
    });
    const toneId = await ctx.db.insert("tones", {
      id: "warm",
      name: "Warm",
      promptGuidanceForAI: "Be warm",
      color: "#222222",
      icon: "sun",
    });
    return { meId, otherId, styleId, toneId };
  });
  return { t, ...ids };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const generate = (setupResult: Setup, progressKey?: string) =>
  setupResult.t.withIdentity(ME).action(api.core.ai.generateAIQuestionForFeed, {
    count: 1,
    anchoredStyleId: setupResult.styleId,
    anchoredToneId: setupResult.toneId,
    ...(progressKey ? { progressKey } : {}),
  });

const stageOf = (t: Setup["t"], identity = ME) =>
  t.withIdentity(identity).query(api.core.generationProgress.getGenerationProgress, { requestKey: KEY });

const ledger = (t: Setup["t"]) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("aiSpendDays").collect();
    return rows.map((row) => [row.spendClass, row.costUsd, row.calls]);
  });

describe("streaming a model call", () => {
  test("reports each stage once and returns the whole answer with its usage", async () => {
    create.mockResolvedValue(streamOf(fullStream()) as never);
    const stages: string[] = [];

    const completion = await streamChatCompletion(PARAMS, (stage) => {
      if (stages.at(-1) !== stage) stages.push(stage);
    });

    expect(stages).toEqual(["connecting", "thinking", "writing"]);
    expect(completion.choices[0]).toMatchObject({ finish_reason: "stop", message: { content: ANSWER } });
    expect(completion.usage).toMatchObject({ cost: 0.015 });
    expect(JSON.stringify(completion)).not.toContain(SECRET_REASONING);
    expect(create.mock.calls[0][0]).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  test("a stream that ends with no finish reason is interrupted", async () => {
    create.mockResolvedValue(streamOf([chunk({ content: "{" })]) as never);
    await expect(streamChatCompletion(PARAMS, () => {})).rejects.toBeInstanceOf(InterruptedStreamError);
  });

  test("a provider failure reported as a finish reason is interrupted", async () => {
    create.mockResolvedValue(streamOf([chunk({ content: "{" }), chunk({}, "error")]) as never);
    await expect(streamChatCompletion(PARAMS, () => {})).rejects.toBeInstanceOf(InterruptedStreamError);
  });

  test("a stream that goes quiet stops at the time limit, though the SDK ends the loop quietly", async () => {
    create.mockImplementation(((_params: unknown, options: { signal: AbortSignal }) =>
      Promise.resolve(
        (async function* () {
          yield chunk({ reasoning: "..." });
          await new Promise((resolve) => options.signal.addEventListener("abort", resolve));
        })(),
      )) as never);

    const call = streamChatCompletion(PARAMS, () => {});
    const outcome = expect(call).rejects.toBeInstanceOf(InterruptedStreamError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });
});

describe("a followed feed generation", () => {
  test("saves its questions, charges the reported cost and ends done", async () => {
    const setupResult = await setup();
    create.mockResolvedValue(streamOf(fullStream()) as never);

    const questions = await generate(setupResult, KEY);

    expect(questions).toHaveLength(1);
    expect(await ledger(setupResult.t)).toEqual([["user", 0.015, 1]]);
    expect(await stageOf(setupResult.t)).toEqual({ stage: "done" });
    const runs = await setupResult.t.run(async (ctx) => await ctx.db.query("generationRuns").collect());
    expect(runs[0]).toMatchObject({ status: "succeeded", costUsd: 0.015 });
    expect(JSON.stringify(runs)).not.toContain(SECRET_REASONING);
  });

  test("a stream cut off after the provider accepted it keeps its charge and isn't sent again", async () => {
    const setupResult = await setup();
    create.mockResolvedValue(streamOf([chunk({ content: "{" })], new Error("connection lost")) as never);

    await expect(generate(setupResult, KEY)).rejects.toThrow("stream failed");

    expect(create).toHaveBeenCalledTimes(1);
    const [[spendClass, costUsd, calls]] = await ledger(setupResult.t);
    expect([spendClass, calls]).toEqual(["user", 1]);
    expect(costUsd).toBeGreaterThan(0);
    expect(await stageOf(setupResult.t)).toEqual({ stage: "failed" });
    const usage = await setupResult.t.run(async (ctx) => await ctx.db.query("userAiUsage").collect());
    expect(usage[0]?.count ?? 0).toBe(0);
  });

  test("a refusal before the stream starts charges nothing", async () => {
    const setupResult = await setup();
    create.mockRejectedValue(APIError.generate(400, undefined, "invalid request", {}) as never);

    await expect(generate(setupResult, KEY)).rejects.toThrow("400 invalid request");

    expect(create).toHaveBeenCalledTimes(1);
    expect(await ledger(setupResult.t)).toEqual([["user", 0, 0]]);
    expect(await stageOf(setupResult.t)).toEqual({ stage: "failed" });
  });

  test("without a key it makes the ordinary call and records no progress", async () => {
    const setupResult = await setup();
    create.mockResolvedValue({
      id: "cmpl-1",
      object: "chat.completion",
      created: 0,
      model: "anthropic/claude-opus-5.5",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: ANSWER } }],
      usage: { cost: 0.01 },
    } as never);

    await generate(setupResult);

    expect(create.mock.calls[0][0]).not.toHaveProperty("stream");
    const rows = await setupResult.t.run(async (ctx) => await ctx.db.query("generationProgress").collect());
    expect(rows).toHaveLength(0);
  });

  test("a key that isn't a UUID is ignored", async () => {
    const setupResult = await setup();
    create.mockResolvedValue({
      id: "cmpl-1",
      object: "chat.completion",
      created: 0,
      model: "anthropic/claude-opus-5.5",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: ANSWER } }],
      usage: { cost: 0.01 },
    } as never);

    await generate(setupResult, "x".repeat(5000));

    const rows = await setupResult.t.run(async (ctx) => await ctx.db.query("generationProgress").collect());
    expect(rows).toHaveLength(0);
  });
});

describe("generation progress rows", () => {
  test("only their owner can read them", async () => {
    const { t, meId } = await setup();
    await t.mutation(internal.internal.generationProgress.startProgress, { userId: meId, requestKey: KEY });

    expect(await stageOf(t)).toEqual({ stage: "preparing" });
    expect(await stageOf(t, OTHER)).toBeNull();
    expect(await t.query(api.core.generationProgress.getGenerationProgress, { requestKey: KEY })).toBeNull();
  });

  test("a finished request stays finished", async () => {
    const { t, meId } = await setup();
    const progressId = await t.mutation(internal.internal.generationProgress.startProgress, { userId: meId, requestKey: KEY });
    await t.mutation(internal.internal.generationProgress.setStage, { progressId, stage: "done" });
    await t.mutation(internal.internal.generationProgress.setStage, { progressId, stage: "writing" });
    expect(await stageOf(t)).toEqual({ stage: "done" });
  });

  test("old rows are cleared and recent ones kept", async () => {
    const { t, meId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("generationProgress", { userId: meId, requestKey: "old", stage: "done", updatedAt: Date.now() - 2 * 60 * 60 * 1000 });
      await ctx.db.insert("generationProgress", { userId: meId, requestKey: "new", stage: "done", updatedAt: Date.now() });
    });

    expect(await t.mutation(internal.internal.generationProgress.clearOldProgress, {})).toBe(1);

    const rows = await t.run(async (ctx) => await ctx.db.query("generationProgress").collect());
    expect(rows.map((row) => row.requestKey)).toEqual(["new"]);
  });

  test("deleting a person deletes their progress", async () => {
    const { t, meId, otherId } = await setup();
    await t.mutation(internal.internal.generationProgress.startProgress, { userId: meId, requestKey: KEY });
    await t.mutation(internal.internal.generationProgress.startProgress, { userId: otherId, requestKey: KEY });

    await t.mutation(internal.internal.userDeletion.deleteUserDataPage, { userId: meId });

    const rows = await t.run(async (ctx) => await ctx.db.query("generationProgress").collect());
    expect(rows.map((row) => row.userId)).toEqual([otherId]);
  });
});
