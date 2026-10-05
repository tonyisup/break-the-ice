// The eval harness's local Node tooling (evals/*.mjs). Nothing here touches the network: fetch is
// stubbed, and generate.mjs is only run far enough to hit its guards, or against a stand-in for
// `npx convex run`.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DUP_LIKELY,
  DUP_REVIEW,
  JEV_MODEL,
  JevClient,
  MAX_RETRIES,
  CUTOFFS_HASH,
  FIT_IDS,
  GATE_QUESTIONS,
  QUALITY_CUTOFFS,
  QUESTION_SET_HASH,
  REPORT_ONLY_IDS,
  SAFETY_BLOCK,
  SAFETY_IDS,
  SAFETY_REVIEW,
  answerValues,
  dupRequest,
  dupVerdict,
  gateRequest,
  gateVerdict,
} from "../evals/jev.mjs";
import { mapLimit } from "../evals/async.mjs";
import { classifyFailure, cliError, mergeAttempts, orderedBatches, pendingSeeds, recordFailure, recordSuccess, writeJson } from "../evals/runRecord.mjs";
import {
  COMPARABLE_KEYS,
  REPLICATE_KEYS,
  failureReason,
  frame,
  frameStats,
  hashOf,
  SCORING_VERSION,
  detectableRange,
  differenceInterval,
  fisherExact,
  identityMismatches,
  median,
  poolRates,
  rate,
  round,
  sd,
  tally,
  wilson,
} from "../evals/stats.mjs";

const definitions = {
  style: { slug: "desert-island", name: "Desert Island", definition: "You can only bring ___." },
  tone: { slug: "witty", name: "Witty", definition: "Clever and light." },
  topic: null as null | { slug: string; name: string; definition: string },
};

/** Every gate value comfortably on the passing side. */
const clean: Record<string, number> = {
  readability: 3,
  single_ask: 0.95,
  specificity: 2,
  story_yield: 2,
  answerable: 0.95,
  light_answer_ok: 0.95,
  fit_style: 2,
  fit_tone: 2,
  s_trauma: 0.05,
  s_targets_person: 0.05,
  s_sexual_illegal: 0.05,
  s_politics_religion: 0.05,
  s_humiliation: 0.05,
};

describe("gateVerdict", () => {
  test("passes clean values, and specificity and story yield are reported only", () => {
    expect(gateVerdict(clean)).toEqual({ verdict: "pass", reasons: [] });
    expect(gateVerdict({ ...clean, specificity: 0, story_yield: 0 })).toEqual({ verdict: "pass", reasons: [] });
  });

  test("uses the plan's safety cutoffs, and a block is never softened to review", () => {
    expect([SAFETY_BLOCK, SAFETY_REVIEW]).toEqual([0.7, 0.35]);
    for (const id of SAFETY_IDS) {
      expect(gateVerdict({ ...clean, [id]: SAFETY_BLOCK })).toEqual({ verdict: "block", reasons: [id] });
      expect(gateVerdict({ ...clean, [id]: SAFETY_BLOCK - 0.001 })).toEqual({ verdict: "review", reasons: [id] });
      expect(gateVerdict({ ...clean, [id]: SAFETY_REVIEW })).toEqual({ verdict: "review", reasons: [id] });
      expect(gateVerdict({ ...clean, [id]: SAFETY_REVIEW - 0.001 })).toEqual({ verdict: "pass", reasons: [] });
    }
    expect(gateVerdict({ ...clean, s_trauma: 0.5, s_humiliation: 0.9, readability: 1 })).toEqual({
      verdict: "block",
      reasons: ["s_trauma", "s_humiliation", "readability"],
    });
  });

  test("a quality value below its cutoff goes to review, and a missing one (no topic) is skipped", () => {
    for (const [id, cutoff] of Object.entries(QUALITY_CUTOFFS)) {
      expect(gateVerdict({ ...clean, [id]: cutoff - 0.01 })).toEqual({ verdict: "review", reasons: [id] });
      expect(gateVerdict({ ...clean, [id]: cutoff })).toEqual({ verdict: "pass", reasons: [] });
    }
    expect(clean.fit_topic).toBeUndefined();
    expect(gateVerdict(clean).verdict).toBe("pass");
  });

  test("leaving out the fit questions decides on safety and the rest of quality", () => {
    expect(gateVerdict({ ...clean, fit_style: 0 })).toEqual({ verdict: "review", reasons: ["fit_style"] });
    expect(gateVerdict({ ...clean, fit_style: 0 }, { ignore: FIT_IDS })).toEqual({ verdict: "pass", reasons: [] });
    const { fit_style: _, fit_tone: __, ...withoutFit } = clean;
    expect(gateVerdict(withoutFit, { ignore: FIT_IDS }).verdict).toBe("pass");
    expect(gateVerdict({ ...clean, s_trauma: 0.9 }, { ignore: FIT_IDS }).verdict).toBe("block");
  });

  test("a missing or non-numeric answer is never a pass", () => {
    for (const id of [...SAFETY_IDS, "readability", "single_ask", "fit_style"]) {
      const { [id]: _, ...partial } = clean;
      expect(gateVerdict(partial), id).toEqual({ verdict: "review", reasons: [`${id} missing`] });
      expect(gateVerdict({ ...clean, [id]: Number.NaN }).verdict, id).toBe("review");
    }
  });
});

describe("Jev requests", () => {
  test("the gate asks every question the verdict reads, each cutoff on that answer's scale", () => {
    const withTopic = gateRequest({
      text: "What would you bring?",
      definitions: { ...definitions, topic: { slug: "food", name: "Food", definition: "Cooking and eating." } },
    });
    const withoutTopic = gateRequest({ text: "What would you bring?", definitions });
    const asked: Record<string, { type: string; criteria: unknown }> = withTopic.questions;

    // A gate id that isn't asked would come back missing and go to review on every question.
    for (const id of [...SAFETY_IDS, ...Object.keys(QUALITY_CUTOFFS)]) {
      expect(asked, id).toHaveProperty(id);
    }
    for (const id of SAFETY_IDS) expect(asked[id].type, id).toBe("noul");
    for (const [id, cutoff] of Object.entries(QUALITY_CUTOFFS)) {
      const question = asked[id];
      const top = question.type === "noul" ? 1 : (question.criteria as unknown[]).length - 1;
      expect(cutoff, id).toBeGreaterThan(0);
      expect(cutoff, id).toBeLessThanOrEqual(top);
    }

    // State is only the question and short definitions: no slugs, no topic unless the seed has one.
    expect(withTopic.state).toEqual({
      question: "What would you bring?",
      style: { name: "Desert Island", definition: "You can only bring ___." },
      tone: { name: "Witty", definition: "Clever and light." },
      topic: { name: "Food", definition: "Cooking and eating." },
    });
    expect(withoutTopic.state).not.toHaveProperty("topic");
    expect(withoutTopic.questions).not.toHaveProperty("fit_topic");
  });

  test("the duplicate check compares the two questions in the order given, cut at 1.5 and 1.0", () => {
    const request = dupRequest("Rock?", "Stone?");

    expect(request.state).toEqual({ question_a: "Rock?", question_b: "Stone?" });
    expect(Object.keys(request.questions).sort()).toEqual(["dup_level", "same_answer", "same_template"]);
    expect(request.questions.dup_level.type).toBe("score");
    expect(dupRequest("Stone?", "Rock?").state).toEqual({ question_a: "Stone?", question_b: "Rock?" });

    expect([DUP_LIKELY, DUP_REVIEW]).toEqual([1.5, 1.0]);
    expect([2, 1.5, 1.499, 1, 0.999, 0].map(dupVerdict)).toEqual([
      "likely",
      "likely",
      "review",
      "review",
      "different",
      "different",
    ]);
  });

  test("the judge is pinned, and the question wording and cutoffs are fingerprinted", () => {
    expect(JEV_MODEL).toBe("jev-1.13.0");
    expect(QUESTION_SET_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(CUTOFFS_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(CUTOFFS_HASH).not.toBe(QUESTION_SET_HASH);
  });

  test("every gate question is safety, has a quality cutoff, or is report-only", () => {
    expect(SAFETY_IDS).toEqual(["s_trauma", "s_targets_person", "s_sexual_illegal", "s_politics_religion", "s_humiliation"]);
    for (const id of Object.keys(GATE_QUESTIONS)) {
      const roles = [SAFETY_IDS.includes(id), id in QUALITY_CUTOFFS, REPORT_ONLY_IDS.includes(id)].filter(Boolean);
      expect(roles, id).toHaveLength(1);
    }
  });

  test("answerValues reads a Noul's probability and a Score's weighted level", () => {
    expect(
      answerValues({
        single_ask: { type: "noul", noul: 0.82, score: 99 },
        readability: { type: "score", score: 2.4, noul: 99 },
      }),
    ).toEqual({ single_ask: 0.82, readability: 2.4 });
  });
});

describe("mapLimit", () => {
  test("keeps the input order with at most `limit` in flight, for any item count", async () => {
    let inFlight = 0;
    let peak = 0;
    const delays = [30, 5, 20, 0, 10];

    const results = await mapLimit(delays, 2, async (ms: number, i: number) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, ms));
      inFlight--;
      return `${i}:${ms}`;
    });

    expect(results).toEqual(["0:30", "1:5", "2:20", "3:0", "4:10"]);
    expect(peak).toBe(2);

    const fn = vi.fn(async (x: number) => x * 2);

    expect(await mapLimit([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
    expect(await mapLimit([1, 2], 10, fn)).toEqual([2, 4]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("JevClient", () => {
  let dir: string;
  let cachePath: string;
  const fetchMock = vi.fn();
  const answers = {
    dup_level: { type: "score", score: 0.4 },
    same_answer: { type: "noul", noul: 0.1 },
    same_template: { type: "noul", noul: 0.2 },
  };
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
  const errorResponse = (status: number, text: string) => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jev-cache-"));
    cachePath = join(dir, "jev-cache.jsonl");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  test("needs an API key, and answers a repeat request from its disk cache, across runs", async () => {
    expect(() => new JevClient({ apiKey: undefined, cachePath })).toThrow(/TYPESAFE_API_KEY/);
    fetchMock.mockResolvedValue(
      okResponse({ model: "jev-1", answers, usage: { input_tokens: 10, output_tokens: 2 }, request_id: "dropped" }),
    );
    const first = new JevClient({ apiKey: "test-key", cachePath });

    const fresh = await first.ask(dupRequest("Rock?", "Stone?"));
    const repeat = await first.ask(dupRequest("Rock?", "Stone?"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: JEV_MODEL, state: { question_a: "Rock?" } });
    expect(fresh).toEqual({ model: "jev-1", answers, usage: { input_tokens: 10, output_tokens: 2 } });
    expect(repeat).toEqual(fresh);
    expect(first.usage).toEqual({ requests: 1, cached: 1, inputTokens: 20, outputTokens: 4, models: { "jev-1": 2 } });

    const second = new JevClient({ apiKey: "test-key", cachePath });
    expect(await second.ask(dupRequest("Rock?", "Stone?"))).toEqual(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The other order is a different request.
    await second.ask(dupRequest("Stone?", "Rock?"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries rate limits, server errors and network failures", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(errorResponse(429, "slow down"))
      .mockResolvedValueOnce(errorResponse(503, "unavailable"))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(okResponse({ model: "jev-1", answers, usage: {} }));
    const client = new JevClient({ apiKey: "test-key", cachePath });

    const pending = client.ask(dupRequest("Rock?", "Stone?"));
    await vi.runAllTimersAsync();

    expect((await pending).answers).toEqual(answers);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(client.usage.requests).toBe(1);
  });

  test("abandons and retries a request that times out, even while reading the body", async () => {
    vi.useFakeTimers();
    const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    fetchMock
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => Promise.reject(timeout()), text: async () => "" })
      .mockResolvedValueOnce(okResponse({ model: "jev-1", answers, usage: {} }));
    const client = new JevClient({ apiKey: "test-key", cachePath });

    const pending = client.ask(dupRequest("Rock?", "Stone?"));
    await vi.runAllTimersAsync();

    expect((await pending).answers).toEqual(answers);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("fails at once on a client error, and after five retries on a server error", async () => {
    vi.useFakeTimers();
    const client = new JevClient({ apiKey: "test-key", cachePath });

    fetchMock.mockResolvedValue(errorResponse(400, "bad questions"));
    await expect(client.ask(dupRequest("Rock?", "Stone?"))).rejects.toThrow("Jev request failed (400): bad questions");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(errorResponse(500, "boom"));
    const failing = expect(client.ask(dupRequest("Rock?", "Stone?"))).rejects.toThrow("Jev request failed (500): boom");
    await vi.runAllTimersAsync();
    await failing;
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(existsSync(cachePath)).toBe(false);
  });

  test("a malformed answer fails and isn't cached", async () => {
    const client = new JevClient({ apiKey: "test-key", cachePath });
    fetchMock.mockResolvedValue(okResponse({ model: "jev-1", answers: { dup_level: { type: "score", score: 0.4 } }, usage: {} }));

    await expect(client.ask(dupRequest("Rock?", "Stone?"))).rejects.toThrow(/same_answer/);
    fetchMock.mockResolvedValue(okResponse({ model: "jev-1", answers: { ...answers, dup_level: { type: "noul", noul: 1 } }, usage: {} }));
    await expect(client.ask(dupRequest("Rock?", "Stone?"))).rejects.toThrow(/dup_level/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(existsSync(cachePath)).toBe(false);
  });

  test("never has more than maxConcurrent requests in flight, however callers nest them", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return okResponse({ model: "jev-1", answers, usage: {} });
    });
    const client = new JevClient({ apiKey: "test-key", cachePath, maxConcurrent: 2 });

    await Promise.all(
      ["a", "b", "c"].map((x) => Promise.all(["1", "2", "3"].map((y) => client.ask(dupRequest(x, y))))),
    );

    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(peak).toBe(2);
  });

  test("skips an unreadable cache line instead of failing", async () => {
    fetchMock.mockResolvedValue(okResponse({ model: "jev-1", answers, usage: {} }));
    const first = new JevClient({ apiKey: "test-key", cachePath });
    await first.ask(dupRequest("Rock?", "Stone?"));
    appendFileSync(cachePath, '{"key":"cut off mid-wri');
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const second = new JevClient({ apiKey: "test-key", cachePath });

    expect(second.skippedCacheLines).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Skipped 1 unreadable line/));
    expect(await second.ask(dupRequest("Rock?", "Stone?"))).toMatchObject({ answers });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a cached answer with the wrong shape is asked again", async () => {
    fetchMock.mockResolvedValue(okResponse({ model: "jev-1", answers, usage: {} }));
    const first = new JevClient({ apiKey: "test-key", cachePath });
    await first.ask(dupRequest("Rock?", "Stone?"));
    const [line] = readFileSync(cachePath, "utf8").trim().split("\n");
    const { key } = JSON.parse(line);
    writeFileSync(cachePath, `${JSON.stringify({ key, response: { model: "jev-1", answers: { dup_level: answers.dup_level } } })}\n`);

    const second = new JevClient({ apiKey: "test-key", cachePath });
    expect(await second.ask(dupRequest("Rock?", "Stone?"))).toMatchObject({ answers });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("summary helpers", () => {
  test("round keeps a missing value missing instead of reporting 0", () => {
    expect([round(1.23456), round(1.23456, 1), round(null), round(undefined), round(Number.NaN)]).toEqual([
      1.235,
      1.2,
      null,
      null,
      null,
    ]);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2, 10])).toBe(2.5);
    expect(tally(["b", "a", "b"])).toEqual({ b: 2, a: 1 });
  });

  test("wilson gives a 95% interval that stays within 0 and 1", () => {
    expect(wilson(78, 100)).toEqual([0.689, 0.85]);
    expect(wilson(0, 10)?.[0]).toBe(0);
    expect(wilson(10, 10)?.[1]).toBe(1);
    expect(wilson(0, 0)).toBeNull();
  });

  test("frames are opening words, and cross-style repeats are counted apart from a style's required opener", () => {
    expect(frame("You’re stranded on an island: what now?")).toBe("you're stranded on");
    const stats = frameStats([
      ...["a", "b", "c"].map((x) => ({ text: `Would you rather ${x}?`, style: "would-you-rather" })),
      { text: "If you could fly, where?", style: "super-power" },
      { text: "If you could rewind, when?", style: "time-capsule" },
      { text: "What is your oddest habit?", style: "open-ended" },
    ]);

    expect(stats.repeatAt).toBe(3);
    expect(stats.repeatedShare).toBe(0.5);
    expect(stats.crossStyleShare).toBe(0.333);
    expect(stats.topCrossStyle).toEqual([["if you could", 2]]);
  });

  test("failure reasons group like failures", () => {
    const cut = (position: number) =>
      `Error: [Request ID: ${position}] Server Error Uncaught Error: Model output could not be read: Unterminated string in JSON at position ${position} (line 4)     at async handler (../../convex/internal/evals.ts:95:6)`;
    expect(failureReason(cut(198))).toBe(failureReason(cut(1285)));
    expect(failureReason(cut(198))).toBe("Model output could not be read: Unterminated string in JSON");
    expect(failureReason('Uncaught ConvexError: {"code":"AI_GENERATION_FAILED","message":"The AI sent back an answer we couldn\'t use."}')).toBe(
      "The AI sent back an answer we couldn't use.",
    );
    expect(failureReason(null)).toBe("");
  });
});

describe("comparison statistics", () => {
  test("Fisher's exact test matches known values, including small counts", () => {
    // The tea-tasting table: 3 of 4 against 1 of 4.
    expect(fisherExact(3, 4, 1, 4)).toBeCloseTo(0.4857, 4);
    expect(fisherExact(50, 100, 50, 100)).toBeCloseTo(1, 6);
    // Where the normal approximation would wrongly call a difference at 0.05 / 7.
    expect(fisherExact(1, 61, 4, 20)).toBeCloseTo(0.0121, 3);
    expect(fisherExact(0, 0, 1, 10)).toBeNull();
  });

  test("the difference interval and detectable range describe what a run could show", () => {
    const interval = differenceInterval(162, 200, 70, 100)!;
    expect(interval[0]).toBeLessThan(-0.11);
    expect(interval[1]).toBeLessThan(0);
    const range = detectableRange(233, 300, 100, 0.05 / 7)!;
    expect(range.below).toBeLessThan(0.7);
    expect(range.above).toBeGreaterThan(0.85);
    expect(fisherExact(233, 300, Math.round(range.below! * 100), 100)).toBeLessThan(0.05 / 7);
    expect(fisherExact(233, 300, Math.round(range.below! * 100) + 1, 100)).toBeGreaterThanOrEqual(0.05 / 7);
  });

  test("pooling adds up counts across runs, keeping each run's rate", () => {
    const pooled = poolRates([{ passRate: rate(80, 100) }, { passRate: rate(81, 98), blockRate: rate(1, 98) }]);

    expect(pooled.passRate).toEqual({ k: 161, n: 198, rate: 0.813, interval95: wilson(161, 198), perRun: [0.8, 0.827] });
    expect(pooled.blockRate).toMatchObject({ k: 1, n: 98, perRun: [null, 0.01] });
    expect(sd([1, 2, 3])).toBe(1);
    expect(sd([1])).toBeNull();
  });

  test("identity checks name the keys that differ", () => {
    const base = { judge: { questionSetHash: "a", cutoffsHash: "c" }, generator: { seedSetHash: "s", promptSetHash: "p1", batchSize: 5 } };
    const changedPrompt = { ...base, generator: { ...base.generator, promptSetHash: "p2" } };

    expect(identityMismatches([base, base], REPLICATE_KEYS)).toEqual([]);
    expect(identityMismatches([base, changedPrompt], REPLICATE_KEYS)).toEqual(["generator.promptSetHash"]);
    expect(identityMismatches([base, changedPrompt], COMPARABLE_KEYS)).toEqual([]);
    // A different model is a different setup, but still compared on the same measuring stick.
    const otherModel = { ...base, generator: { ...base.generator, model: "anthropic/claude-sonnet-5.5" } };
    expect(identityMismatches([base, otherModel], REPLICATE_KEYS)).toEqual(["generator.model"]);
    expect(identityMismatches([base, otherModel], COMPARABLE_KEYS)).toEqual([]);
    expect(hashOf({ a: 1 })).toBe(hashOf({ a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });

  test("every committed baseline records each replicate key, so compare never reads a missing one as a change", () => {
    const runsDir = join(__dirname, "..", "evals", "runs");
    const baselines = readdirSync(runsDir).filter((file) => file.endsWith(".json"));

    expect(baselines.length).toBeGreaterThan(0);
    for (const file of baselines) {
      const { identity } = JSON.parse(readFileSync(join(runsDir, file), "utf8"));
      expect(Object.keys(identity).sort(), file).toEqual([...REPLICATE_KEYS].sort());
    }
  });
});

describe("run record", () => {
  const seeds = [{ id: "s01" }, { id: "s02" }, { id: "s03" }];

  test("a rerun retries only failed seeds and keeps their failure history, in seed order", () => {
    const batches = new Map();
    recordFailure(batches, seeds[1], "Error: Uncaught Error: Model output could not be read", "abc123");
    recordSuccess(batches, seeds[0], { candidates: [] }, "abc123");

    expect(pendingSeeds(seeds, batches).map((seed: { id: string }) => seed.id)).toEqual(["s02", "s03"]);
    expect(orderedBatches(seeds, batches).map((batch: { seed: { id: string } }) => batch.seed.id)).toEqual(["s01", "s02"]);

    recordFailure(batches, seeds[1], "Could not find public function for 'internal/evals:generateEvalBatch'", "def456");
    recordSuccess(batches, seeds[1], { candidates: [] }, "def456");

    expect(batches.get("s02")).toMatchObject({ ok: true, commit: "def456" });
    expect(batches.get("s02").failures.map((failure: { stage: string; commit: string }) => [failure.stage, failure.commit])).toEqual([
      ["generation", "abc123"],
      ["setup", "def456"],
    ]);
    expect(pendingSeeds(seeds, batches).map((seed: { id: string }) => seed.id)).toEqual(["s03"]);
  });

  test("failures are tagged with the step they broke at", () => {
    expect(classifyFailure('Uncaught ConvexError: {"code":"EVALS_DISABLED","message":"Evals are off"}')).toBe("setup");
    expect(classifyFailure('No active styles entry found for slug "x".')).toBe("setup");
    expect(classifyFailure('Uncaught ConvexError: {"code":"AI_BUDGET_PAUSED","message":"paused"}')).toBe("budget");
    expect(classifyFailure("Server Error Uncaught Error: Model output could not be read")).toBe("generation");
    expect(classifyFailure('Uncaught ConvexError: {"code":"AI_GENERATION_FAILED"}')).toBe("generation");
    // An unexpected server error isn't in the generation records, so it is counted separately.
    expect(classifyFailure("Server Error Uncaught Error: ReturnsValidationError")).toBe("server");
    expect(classifyFailure("spawn npx ENOENT")).toBe("cli");
  });

  test("fetched generation runs are added once each, and a fresh read replaces an older one", () => {
    const running = { runId: "r1", status: "running" };
    const failed = { runId: "r1", status: "failed" };
    const b = { runId: "r2", status: "succeeded" };
    expect(mergeAttempts([running], [failed, b])).toEqual([failed, b]);
    expect(mergeAttempts([failed, b], [])).toEqual([failed, b]);
  });

  test("JSON is written whole, through a temp file", () => {
    const dir = mkdtempSync(join(tmpdir(), "write-json-"));
    const path = join(dir, "generated.json");
    writeJson(path, { a: 1 });
    writeJson(path, { a: 2 });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ a: 2 });
    expect(readdirSync(dir)).toEqual(["generated.json"]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a CLI failure is reported by the last lines of its output", () => {
    const error = { message: "Command failed: npx convex run internal/evalData:evalRunAttempts {...}", stderr: "npm notice\nline 2\n✖ Failed\nUncaught ConvexError: Evals are off\n" };
    expect(cliError(error)).toBe("line 2 ✖ Failed Uncaught ConvexError: Evals are off");
    expect(cliError(new Error("spawn npx ENOENT"))).toBe("spawn npx ENOENT");
  });
});

describe("scripts", () => {
  // Each test runs copies of the scripts in a temp directory, so nothing touches the real
  // evals/runs or reads the real .env files. No inherited environment and an unusable PATH: if a
  // guard ever regressed, a script would fail to find npx instead of generating (and paying for) a
  // run on dev.
  const repoRoot = join(__dirname, "..");
  let root: string;
  let evalsDir: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "evals-scripts-"));
    evalsDir = join(root, "evals");
    mkdirSync(join(evalsDir, "runs"), { recursive: true });
    for (const file of readdirSync(join(repoRoot, "evals"))) {
      if (file.endsWith(".mjs") || file === "seeds.json") cpSync(join(repoRoot, "evals", file), join(evalsDir, file));
    }
    symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const runScript = (name: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(evalsDir, name), ...args], {
      cwd: root,
      env: { PATH: "/nonexistent", ...env },
      encoding: "utf8",
      timeout: 10_000,
    });
  const writeRun = (run: string, files: Record<string, unknown>) => {
    const dir = join(evalsDir, "runs", run);
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
    }
  };
  const readRunFile = (path: string) => JSON.parse(readFileSync(join(evalsDir, "runs", path), "utf8"));

  describe("generate", () => {
    test("refuses a bad run name before doing anything", () => {
      const result = runScript("generate.mjs", ["Bad Name"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Usage: node evals\/generate\.mjs/);
      expect(existsSync(join(evalsDir, "runs", "Bad Name"))).toBe(false);
    });

    test("refuses a non-dev deployment named in the shell", () => {
      for (const [name, value] of [
        ["CONVEX_DEPLOY_KEY", "prod:test-only|abc"],
        ["CONVEX_DEPLOY_KEY", "preview:test-only|abc"],
        ["CONVEX_DEPLOYMENT", "prod:happy-otter-123"],
      ]) {
        const result = runScript("generate.mjs", ["guard-test"], { [name]: value });
        expect(result.status, value).toBe(1);
        expect(result.stderr, value).toMatch(new RegExp(`${name} points at a non-dev deployment`));
      }
      expect(existsSync(join(evalsDir, "runs", "guard-test"))).toBe(false);
    });

    test("reads .env.local as the Convex CLI does, including YAML-style lines", () => {
      for (const line of ["CONVEX_DEPLOYMENT=prod:happy-otter-123", "CONVEX_DEPLOYMENT: prod:happy-otter-123", 'export CONVEX_DEPLOYMENT="prod:x" # main']) {
        writeFileSync(join(root, ".env.local"), `${line}\n`);
        const result = runScript("generate.mjs", ["guard-test"]);
        expect(result.status, line).toBe(1);
        expect(result.stderr, line).toMatch(/CONVEX_DEPLOYMENT points at a non-dev deployment/);
      }
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\nCONVEX_SELF_HOSTED_URL=https://convex.example\n");
      const selfHosted = runScript("generate.mjs", ["guard-test"]);
      expect(selfHosted.status).toBe(1);
      expect(selfHosted.stderr).toMatch(/CONVEX_SELF_HOSTED_URL is set/);
      // The shell wins over the file, as with the CLI.
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      const shell = runScript("generate.mjs", ["guard-test"], { CONVEX_DEPLOYMENT: "prod:happy-otter-123" });
      expect(shell.stderr).toMatch(/non-dev deployment/);
    });

    test("refuses when no deployment is configured", () => {
      const result = runScript("generate.mjs", ["guard-test"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/No Convex deployment is configured/);
    });

    test("refuses uncommitted convex/ changes unless allowed", () => {
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      spawnSync("git", ["init", "-q"], { cwd: root });
      mkdirSync(join(root, "convex"));
      writeFileSync(join(root, "convex", "draft.ts"), "export {};\n");

      const result = runScript("generate.mjs", ["guard-test"], { PATH: "/usr/bin:/bin" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/convex\/ has uncommitted changes/);
    });

    test("won't resume a run at a different commit", () => {
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      const git = (...args: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: root });
      git("init", "-q");
      git("commit", "-q", "--allow-empty", "-m", "start");
      writeRun("resumed", {
        "generated.json": { run: "resumed", invocations: [{ startedAtMs: 0, commit: "0ld0ld0", generated: [], attemptsComplete: true }], attempts: [], batches: [] },
      });

      const result = runScript("generate.mjs", ["resumed"], { PATH: "/usr/bin:/bin" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/was generated at 0ld0ld0 .* Resuming would mix code versions/);
    });

    test("refuses a missing, empty, repeated or misplaced --model and any unknown argument", () => {
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      const cases = [
        ["guard-test", "--model"],
        ["guard-test", "--model", ""],
        ["guard-test", "--model", "--allow-local"],
        ["guard-test", "--model=anthropic/claude-sonnet-5.5"],
        ["guard-test", "--modle", "anthropic/claude-sonnet-5.5"],
        ["guard-test", "--model", "a/b", "--model", "c/d"],
        ["guard-test", "extra"],
        // A flag before the run name would otherwise become the run name.
        ["--model", "anthropic/claude-sonnet-5.5", "guard-test"],
      ];
      for (const args of cases) {
        const result = runScript("generate.mjs", args);
        expect(result.status, args.join(" ")).toBe(1);
        expect(result.stderr, args.join(" ")).toMatch(/Usage: node evals\/generate\.mjs/);
      }
      expect(existsSync(join(evalsDir, "runs", "guard-test"))).toBe(false);
      expect(existsSync(join(evalsDir, "runs", "--model"))).toBe(false);
    });

    test("won't switch the model of a run that has reached one", () => {
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      const record = (run: string, model?: string) => ({
        run,
        ...(model ? { model } : {}),
        invocations: [],
        attempts: [{ runId: "r1", status: "succeeded" }],
        batches: [],
      });
      // Runs from before --model have no model recorded, and used the preset.
      writeRun("preset-run", { "generated.json": record("preset-run") });
      const switched = runScript("generate.mjs", ["preset-run", "--model", "anthropic/claude-sonnet-5.5"]);
      expect(switched.status).toBe(1);
      expect(switched.stderr).toMatch(/generated with the preset, not --model anthropic\/claude-sonnet-5\.5\. A run keeps one model; rerun without --model/);

      writeRun("sonnet-run", { "generated.json": record("sonnet-run", "anthropic/claude-sonnet-5.5") });
      const other = runScript("generate.mjs", ["sonnet-run", "--model", "anthropic/claude-opus-5.5"]);
      expect(other.status).toBe(1);
      expect(other.stderr).toMatch(/generated with --model anthropic\/claude-sonnet-5\.5, not --model anthropic\/claude-opus-5\.5/);

      // An interrupted invocation hasn't read back its model calls yet, so it may have reached one.
      writeRun("interrupted", {
        "generated.json": { run: "interrupted", model: "anthropic/claude-sonnet-5.5", invocations: [{ startedAtMs: 0, commit: "abc", attemptsComplete: false }], attempts: [], batches: [] },
      });
      const resumed = runScript("generate.mjs", ["interrupted", "--model", "anthropic/claude-opus-5.5"]);
      expect(resumed.status).toBe(1);
      expect(resumed.stderr).toMatch(/A run keeps one model/);

      // So may a batch that failed past setup, even when no generation run was read back.
      writeRun("cli-failed", {
        "generated.json": {
          run: "cli-failed",
          model: "anthropic/claude-sonnet-5.5",
          invocations: [{ startedAtMs: 0, commit: "abc", generated: [], attemptsComplete: true }],
          attempts: [],
          batches: [{ seed: { id: "s01", style: "a", tone: "t" }, ok: false, failures: [{ stage: "cli", commit: "abc", message: "timed out" }] }],
        },
      });
      const cliFailed = runScript("generate.mjs", ["cli-failed", "--model", "anthropic/claude-opus-5.5"]);
      expect(cliFailed.status).toBe(1);
      expect(cliFailed.stderr).toMatch(/A run keeps one model/);
    });

    test("sends --model with every batch and records it, a rerun keeps the run's model, and a run that never reached a model can switch", () => {
      writeFileSync(join(root, ".env.local"), "CONVEX_DEPLOYMENT=dev:quiet-otter-1\n");
      const git = (...args: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: root });
      git("init", "-q");
      git("commit", "-q", "--allow-empty", "-m", "start");
      writeFileSync(
        join(evalsDir, "seeds.json"),
        JSON.stringify({ batchSize: 1, seeds: [{ id: "s01", style: "a", tone: "t" }, { id: "s02", style: "b", tone: "t" }] }),
      );
      // A stand-in for `npx convex run` that logs each call and answers as dev would. FAIL_SEED
      // makes that seed's batch fail, so a rerun has something to resume; a model name with a
      // space is refused before any model call, as the deployment's name check does; FAIL_LIBRARY
      // fails the first call of an invocation.
      const bin = join(root, "bin");
      const calls = join(root, "calls.jsonl");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "fake-convex.mjs"),
        `import { appendFileSync, readFileSync } from "node:fs";
const [, , fn, json] = process.argv.slice(2);
const args = JSON.parse(json);
const badModel = /\\s/.test(args.model ?? "");
if (fn === "internal/evals:evalLibraryStats" && process.env.FAIL_LIBRARY) {
  console.error("Uncaught ConvexError: {\\"code\\":\\"EVALS_DISABLED\\"}");
  process.exit(1);
}
const fail = fn === "internal/evals:generateEvalBatch" && (badModel || args.seedId === process.env.FAIL_SEED);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ fn, args, ok: !fail }) + "\\n");
if (fail) {
  console.error(badModel ? 'Uncaught ConvexError: {"code":"EVAL_SETUP"}' : "Uncaught Error: Model output could not be read");
  process.exit(1);
}
const generatedRuns = readFileSync(${JSON.stringify(calls)}, "utf8").trim().split("\\n").map((line) => JSON.parse(line))
  .filter((call) => call.ok && call.fn === "internal/evals:generateEvalBatch" && call.args.runLabel === args.runLabel)
  .map((call) => ({ runId: "r-" + call.args.runLabel + "-" + call.args.seedId, status: "succeeded" }));
const answers = {
  "internal/evals:evalLibraryStats": { publicQuestions: 10, withEmbedding: 10 },
  "internal/evals:generateEvalBatch": { runId: "r-" + args.runLabel + "-" + args.seedId, model: args.model ?? "@preset/x", candidates: [] },
  "internal/evalData:evalRunAttempts": generatedRuns,
};
console.log(JSON.stringify(answers[fn]));
`,
      );
      writeFileSync(join(bin, "npx"), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, "fake-convex.mjs")}" "$@"\n`, { mode: 0o755 });
      const PATH = `${bin}:/usr/bin:/bin`;
      const batchCalls = () =>
        readFileSync(calls, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter((call) => call.fn === "internal/evals:generateEvalBatch")
          .map((call) => [call.args.seedId, call.args.model]);

      const first = runScript("generate.mjs", ["sonnet-run", "--model", "anthropic/claude-sonnet-5.5"], { PATH, FAIL_SEED: "s02" });
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toMatch(/2 of 2 seeds to generate for run "sonnet-run" at \w+ with anthropic\/claude-sonnet-5\.5\./);
      expect(first.stdout).toMatch(/1 seeds failed; rerun to retry them/);

      // Without --model, a rerun keeps the run's own model.
      const resumed = runScript("generate.mjs", ["sonnet-run"], { PATH });
      expect(resumed.status, resumed.stderr).toBe(0);
      expect(resumed.stdout).toMatch(/1 of 2 seeds to generate .* with anthropic\/claude-sonnet-5\.5\./);
      expect(resumed.stdout).toMatch(/All seeds generated/);
      expect(batchCalls().sort()).toEqual([
        ["s01", "anthropic/claude-sonnet-5.5"],
        ["s02", "anthropic/claude-sonnet-5.5"],
        ["s02", "anthropic/claude-sonnet-5.5"],
      ]);
      const generated = readRunFile("sonnet-run/generated.json");
      expect(generated.model).toBe("anthropic/claude-sonnet-5.5");
      expect(generated.batches.map((batch: { ok: boolean; result: { model: string } }) => [batch.ok, batch.result.model])).toEqual([
        [true, "anthropic/claude-sonnet-5.5"],
        [true, "anthropic/claude-sonnet-5.5"],
      ]);

      // A misspelled model is refused before any model call, so the run can switch to the right one;
      // once that one has generated, the run keeps it.
      const typo = runScript("generate.mjs", ["typo-run", "--model", "Claude Sonnet"], { PATH });
      expect(typo.stdout).toMatch(/2 seeds were refused before generating; fix the setup \(pass the right --model/);
      const fixed = runScript("generate.mjs", ["typo-run", "--model", "anthropic/claude-sonnet-5.5"], { PATH });
      expect(fixed.status, fixed.stderr).toBe(0);
      expect(fixed.stdout).toMatch(/All seeds generated/);
      expect(readRunFile("typo-run/generated.json").model).toBe("anthropic/claude-sonnet-5.5");
      const switched = runScript("generate.mjs", ["typo-run", "--model", "anthropic/claude-opus-5.5"], { PATH });
      expect(switched.status).toBe(1);
      expect(switched.stderr).toMatch(/A run keeps one model; rerun without --model/);

      // When the first call of an invocation fails, nothing ran, so nothing is recorded and the
      // run isn't tied to that model.
      const unreachable = runScript("generate.mjs", ["unreachable", "--model", "anthropic/claude-sonnet-5.5"], { PATH, FAIL_LIBRARY: "1" });
      expect(unreachable.status).toBe(1);
      expect(unreachable.stderr).toMatch(/Couldn't read the library from dev .* Nothing was generated/);
      expect(existsSync(join(evalsDir, "runs", "unreachable", "generated.json"))).toBe(false);

      // --allow-local sits on either side of --model without swallowing it.
      mkdirSync(join(root, "convex"));
      writeFileSync(join(root, "convex", "draft.ts"), "export {};\n");
      for (const [name, ...flags] of [
        ["local-a", "--allow-local", "--model", "anthropic/claude-sonnet-5.5"],
        ["local-b", "--model", "anthropic/claude-sonnet-5.5", "--allow-local"],
      ]) {
        const local = runScript("generate.mjs", [name, ...flags], { PATH });
        expect(local.status, local.stderr).toBe(0);
        expect(local.stdout, name).toMatch(/at \w+\+local with anthropic\/claude-sonnet-5\.5\./);
        expect(readRunFile(`${name}/generated.json`).model, name).toBe("anthropic/claude-sonnet-5.5");
      }
      rmSync(join(root, "convex"), { recursive: true });

      // Without --model the deployment's preset generates, and the record says so.
      rmSync(calls);
      const preset = runScript("generate.mjs", ["preset-run"], { PATH });
      expect(preset.status, preset.stderr).toBe(0);
      expect(preset.stdout).toMatch(/with the preset\./);
      expect(batchCalls().sort()).toEqual([
        ["s01", undefined],
        ["s02", undefined],
      ]);
      expect(readRunFile("preset-run/generated.json").model).toBeNull();
    });
  });

  describe("score", () => {
    test("needs a run name and a generated run", () => {
      const noRun = runScript("score.mjs", []);
      expect(noRun.status).toBe(1);
      expect(noRun.stderr).toMatch(/Usage: node evals\/score\.mjs/);

      const notGenerated = runScript("score.mjs", ["no-such-run"]);
      expect(notGenerated.status).toBe(1);
      expect(notGenerated.stderr).toMatch(/Run node evals\/generate\.mjs no-such-run first/);
    });

    test("won't overwrite a summary judged under other wording, cutoffs or scoring unless forced", () => {
      writeRun("guard-test", {
        "generated.json": { batches: [], attempts: [] },
        "summary.json": { judge: { questionSetHash: "old", cutoffsHash: CUTOFFS_HASH, scoringVersion: SCORING_VERSION } },
      });

      const refused = runScript("score.mjs", ["guard-test"]);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/different Jev version, question wording, cutoffs or scoring version \(old\//);

      // Forced, it gets past the guard and stops at the missing API key, before any request.
      const forced = runScript("score.mjs", ["guard-test", "--force"]);
      expect(forced.status).toBe(1);
      expect(forced.stderr).toMatch(/TYPESAFE_API_KEY/);
    });

    test("refuses a run whose generation records are missing or unfinished", () => {
      const batch = { seed: { id: "s01" }, ok: true, result: { runId: "r1", candidates: [] } };
      writeRun("missing", { "generated.json": { batches: [batch], attempts: [] } });
      writeRun("unfinished", { "generated.json": { batches: [batch], attempts: [{ runId: "r1", status: "running" }] } });

      const missing = runScript("score.mjs", ["missing"]);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/Generation records are missing for s01/);
      const unfinished = runScript("score.mjs", ["unfinished"]);
      expect(unfinished.status).toBe(1);
      expect(unfinished.stderr).toMatch(/hadn't finished/);

      writeRun("unread", { "generated.json": { batches: [batch], invocations: [{ attemptsComplete: false }], attempts: [{ runId: "r1", status: "succeeded" }] } });
      const unread = runScript("score.mjs", ["unread"]);
      expect(unread.status).toBe(1);
      expect(unread.stderr).toMatch(/Generation records for 1 invocation\(s\) are incomplete/);
    });

    test("computes every primary rate from its own units, end to end from cached Jev answers", () => {
      const definitions = { style: { slug: "a", name: "A", definition: "Ask A." }, tone: { slug: "t", name: "T", definition: "Light." }, topic: null };
      const neighbour = (id: string, text: string, cosine: number) => ({ questionId: id, text, cosine });
      const candidate = (text: string, outcome: string, duplicateOf: string | null, neighbours: unknown[], codeRejections: string[] = []) => ({
        text,
        outcome,
        duplicateOf,
        codeRejections,
        neighbours,
        neighbourError: null,
      });
      const result = (runId: string, candidates: unknown[]) => ({
        runId,
        model: "preset",
        temperature: 0.9,
        settings: { maxOutputTokens: 2900, unusableOutputAttempts: 2, neighbours: 5 },
        promptHash: `hash-${runId}`,
        blueprint: { slug: "b", version: 1 },
        style: { slug: "a", version: 1, name: "A" },
        tone: { slug: "t", version: 1, name: "T" },
        topic: null,
        definitions,
        fingerprintCollisions: 0,
        candidates,
      });
      const generated = {
        run: "e2e",
        deployment: "dev",
        createdAt: "2026-10-01T00:00:00.000Z",
        batchSize: 3,
        invocations: [{ startedAtMs: 0, commit: "abc", library: { publicQuestions: 10, withEmbedding: 10 }, attemptsComplete: true }],
        attempts: [
          { runId: "r0", seedId: "s01", status: "failed", error: "Model output could not be read: Unterminated string in JSON", resolvedModel: "m1", costUsd: 0.01, completionTokens: 900 },
          { runId: "r1", seedId: "s01", status: "succeeded", error: null, resolvedModel: "m1", costUsd: 0.01, completionTokens: 900 },
          { runId: "rc", seedId: "s01", status: "failed", error: "AI provider returned an empty completion (model=m1, finish_reason=content_filter)", resolvedModel: "m1", costUsd: 0, completionTokens: 0 },
          { runId: "rx", seedId: "s02", status: "failed", error: "AI provider returned an empty completion (model=m1, finish_reason=error)", resolvedModel: "m1", costUsd: 0, completionTokens: 0 },
          { runId: "r2", seedId: "s02", status: "succeeded", error: null, resolvedModel: "m1", costUsd: 0.01, completionTokens: 900 },
        ],
        batches: [
          {
            seed: { id: "s01", style: "a", tone: "t" },
            ok: true,
            commit: "abc",
            failures: [],
            result: result("r1", [
              candidate("Q1?", "saved", null, [neighbour("l1", "L1?", 0.8)]),
              candidate("Q2?", "rejected", null, [neighbour("l2", "L2?", 0.6)], ["too long"]),
              // An exact copy the save step caught (its text normalizes to Q1's).
              candidate("Q1 again?", "duplicate", "batch", []),
            ]),
          },
          {
            seed: { id: "s02", style: "a", tone: "t" },
            ok: true,
            commit: "abc",
            failures: [],
            // Two questions where three were asked for.
            result: result("r2", [candidate("Q4?", "saved", null, [neighbour("l1", "L1?", 0.97)]), candidate("L3?", "duplicate", "library", [])]),
          },
        ],
      };

      // Every answer the scorer will ask for, pre-seeded in its cache.
      const gateAnswers = (overrides: Record<string, number>) =>
        Object.fromEntries(
          Object.entries(GATE_QUESTIONS).map(([id, question]) => {
            const value = overrides[id] ?? clean[id];
            return [id, question.type === "noul" ? { type: "noul", noul: value } : { type: "score", score: value }];
          }),
        );
      const dupAnswers = (level: number) => ({
        dup_level: { type: "score", score: level },
        same_answer: { type: "noul", noul: 0.1 },
        same_template: { type: "noul", noul: 0.1 },
      });
      const cacheLine = ({ state, questions }: { state: unknown; questions: unknown }, answers: unknown) =>
        JSON.stringify({
          key: createHash("sha256").update(JSON.stringify({ model: JEV_MODEL, state, questions })).digest("hex"),
          response: { model: JEV_MODEL, answers, usage: { input_tokens: 1, output_tokens: 1 } },
        });
      const gate: Array<[string, Record<string, number>]> = [
        ["Q1?", {}],
        ["Q2?", { s_trauma: 0.9 }],
        ["Q1 again?", { fit_style: 0.5 }],
        ["Q4?", {}],
        ["L3?", {}],
      ];
      const pairs: Array<[string, string, number]> = [
        ["Q1?", "L1?", 0.2],
        ["Q2?", "L2?", 1.8],
        ["Q4?", "L1?", 1.2],
        ["Q1?", "Q2?", 0.1],
        ["Q1?", "Q4?", 1.6],
        ["Q2?", "Q4?", 0],
        // The library copy L3 still pairs with the other questions.
        ["Q4?", "L3?", 0],
        ["Q1?", "L3?", 0],
        ["Q2?", "L3?", 0],
      ];
      const cache = [
        ...gate.map(([text, overrides]) => cacheLine(gateRequest({ text, definitions }), gateAnswers(overrides))),
        ...pairs.flatMap(([a, b, level]) => [cacheLine(dupRequest(a, b), dupAnswers(level)), cacheLine(dupRequest(b, a), dupAnswers(level))]),
      ];
      writeRun("e2e", { "generated.json": generated, "jev-cache.jsonl": `${cache.join("\n")}\n` });

      const scored = runScript("score.mjs", ["e2e"], { TYPESAFE_API_KEY: "test-only" });
      expect(scored.status, scored.stderr).toBe(0);
      const summary = readRunFile("e2e/summary.json");

      expect(summary.jev).toMatchObject({ requests: 0 });
      expect(summary.rates).toMatchObject({
        // Over all 5 generated questions: Q1 and Q4 and L3 pass, the batch copy is review (style
        // fit), Q2 is blocked (rejected by the code checks, still counted).
        passRate: { k: 3, n: 5 },
        reviewRate: { k: 1, n: 5 },
        blockRate: { k: 1, n: 5 },
        passRateWithoutFit: { k: 4, n: 5 },
        reviewRateWithoutFit: { k: 0, n: 5 },
        // The library copy counts as likely; of the 3 compared questions, Q2 is likely.
        libraryLikelyRate: { k: 2, n: 4 },
        // s01 has an exact copy within the batch; s02 has neither a copy nor a likely pair.
        batchLikelyRate: { k: 1, n: 2 },
        // A content-filter empty is the output's fault; a provider error isn't.
        unusableOutputRate: { k: 2, n: 5 },
        providerErrorRate: { k: 1, n: 5 },
        yieldRate: { k: 5, n: 6 },
        withinBatchLikelyPairRate: { k: 0, n: 2 },
        crossBatchLikelyRate: { k: 1, n: 4 },
        savedRate: { k: 2, n: 5 },
        s_traumaFlagRate: { k: 1, n: 5 },
      });
      expect(summary.safety.s_trauma.block).toBe(1);
      expect(summary.judge).toEqual({ model: JEV_MODEL, questionSetHash: QUESTION_SET_HASH, cutoffsHash: CUTOFFS_HASH, scoringVersion: SCORING_VERSION });
      expect(summary.generator).toMatchObject({ model: "preset", resolvedModelSet: ["m1"], neighbours: 5, batchSize: 3 });
      expect(summary.library).toMatchObject({ sizes: [{ publicQuestions: 10, withEmbedding: 10 }], questionsChecked: 3 });
    });

    test("counts curly quotes from each question's flag, or from its text in runs made before the flag, and adds up collisions", () => {
      const definitions = { style: { slug: "a", name: "A", definition: "Ask A." }, tone: { slug: "t", name: "T", definition: "Light." }, topic: null };
      const cacheLine = ({ state, questions }: { state: unknown; questions: unknown }, answers: unknown) =>
        JSON.stringify({
          key: createHash("sha256").update(JSON.stringify({ model: JEV_MODEL, state, questions })).digest("hex"),
          response: { model: JEV_MODEL, answers, usage: { input_tokens: 1, output_tokens: 1 } },
        });
      const cleanAnswers = Object.fromEntries(
        Object.entries(GATE_QUESTIONS).map(([id, question]) => [
          id,
          question.type === "noul" ? { type: "noul", noul: clean[id] } : { type: "score", score: clean[id] },
        ]),
      );
      // One question per batch, each batch in its own style, so the scorer compares no pairs.
      const scoreRun = (run: string, candidates: Array<{ text: string; hadCurlyQuotes?: boolean; fingerprintCollisions: number }>) => {
        const batches = candidates.map(({ fingerprintCollisions, ...candidate }, i) => ({
          seed: { id: `s0${i + 1}`, style: `style-${i}`, tone: "t" },
          ok: true,
          commit: "abc",
          failures: [],
          result: {
            runId: `r${i}`,
            model: "preset",
            temperature: 0.9,
            settings: { maxOutputTokens: 2900, unusableOutputAttempts: 2, neighbours: 0 },
            promptHash: `hash-${i}`,
            blueprint: { slug: "b", version: 1 },
            style: { slug: `style-${i}`, version: 1, name: `Style ${i}` },
            tone: { slug: "t", version: 1, name: "T" },
            topic: null,
            definitions,
            fingerprintCollisions,
            candidates: [{ outcome: "saved", duplicateOf: null, codeRejections: [], neighbours: [], neighbourError: null, ...candidate }],
          },
        }));
        writeRun(run, {
          "generated.json": {
            run,
            deployment: "dev",
            createdAt: "2026-10-01T00:00:00.000Z",
            batchSize: 1,
            invocations: [{ startedAtMs: 0, commit: "abc", library: { publicQuestions: 10, withEmbedding: 10 }, attemptsComplete: true }],
            attempts: batches.map((batch) => ({ runId: batch.result.runId, seedId: batch.seed.id, status: "succeeded", error: null, resolvedModel: "m1", costUsd: 0.01, completionTokens: 900 })),
            batches,
          },
          "jev-cache.jsonl": `${candidates.map(({ text }) => cacheLine(gateRequest({ text, definitions }), cleanAnswers)).join("\n")}\n`,
        });
        const scored = runScript("score.mjs", [run], { TYPESAFE_API_KEY: "test-only" });
        expect(scored.status, scored.stderr).toBe(0);
        return readRunFile(`${run}/summary.json`);
      };

      // Before the flag, the text kept the model's curly quotes. Curly quotes are written as escapes
      // so an editor can't quietly turn them into straight ones.
      const older = scoreRun("older", [
        { text: "Which song\u2019s chorus do you know by heart?", fingerprintCollisions: 0 },
        { text: "Which seat do you always pick on a bus?", fingerprintCollisions: 0 },
      ]);
      expect(older.pipeline.curlyQuotes).toBe(1);
      expect(older.batches.fingerprintCollisions).toBe(0);
      // Now the text is straightened, and the flag says whether the model wrote curly quotes.
      const newer = scoreRun("newer", [
        { text: "Which song's chorus do you know by heart?", hadCurlyQuotes: true, fingerprintCollisions: 1 },
        { text: "Which seat do you always pick on a bus?", hadCurlyQuotes: false, fingerprintCollisions: 2 },
      ]);
      expect(newer.pipeline.curlyQuotes).toBe(1);
      expect(newer.batches.fingerprintCollisions).toBe(3);
    });
  });

  describe("baseline and compare", () => {
    const identity = {
      judge: { questionSetHash: QUESTION_SET_HASH, cutoffsHash: CUTOFFS_HASH, scoringVersion: SCORING_VERSION },
      generator: {
        seedSetHash: "seeds",
        batchSize: 5,
        neighbours: 5,
        promptSetHash: "prompts",
        definitionsHash: "defs",
        taxonomyHash: "tax",
        temperatures: [0.9],
        resolvedModelSet: ["m1"],
        settingsHash: "settings",
        commits: ["abc"],
        resolvedModels: { m1: 20 },
        costUsd: 0.1,
      },
      batches: { failed: [] as string[] },
      library: { sizes: [{ publicQuestions: 205, withEmbedding: 205 }], searchErrors: 0 },
      quality: { readability: { mean: 2.5 } },
    };
    type Overrides = { generator?: Record<string, unknown>; judge?: Record<string, unknown>; library?: Record<string, unknown>; batches?: Record<string, unknown>; rates?: Record<string, unknown> };
    const summary = (run: string, pass: number, overrides: Overrides = {}) => ({
      ...identity,
      run,
      judge: { ...identity.judge, ...overrides.judge },
      generator: { ...identity.generator, runIdsHash: `ids-${run}`, ...overrides.generator },
      library: { ...identity.library, ...overrides.library },
      batches: { ...identity.batches, ...overrides.batches },
      rates: { passRate: rate(pass, 100), passRateWithoutFit: rate(pass, 100), libraryLikelyRate: rate(3, 100), ...overrides.rates },
    });
    const baselineOf = (...runs: Array<[string, number, Overrides?]>) => {
      for (const [run, pass, overrides] of runs) writeRun(run, { "summary.json": summary(run, pass, overrides) });
      return runScript("baseline.mjs", ["base", ...runs.map(([run]) => run)]);
    };

    test("baseline pools replicates", () => {
      const pooled = baselineOf(["a", 80], ["b", 82]);
      expect(pooled.status, pooled.stderr).toBe(0);
      const baseline = readRunFile("base.json");
      expect(baseline.rates.passRate).toMatchObject({ k: 162, n: 200, rate: 0.81, perRun: [0.8, 0.82] });
      expect(baseline.qualityMeans.readability).toEqual({ perRun: [2.5, 2.5], mean: 2.5, sd: 0 });
      expect(baseline.identity["generator.promptSetHash"]).toBe("prompts");
    });

    test("baseline won't count a run twice or replace a baseline unless forced", () => {
      const twice = baselineOf(["a", 80], ["b", 82, { generator: { runIdsHash: "ids-a" } }]);
      expect(twice.status).toBe(1);
      expect(twice.stderr).toMatch(/a run is listed twice/);

      expect(baselineOf(["a", 80], ["b", 82]).status).toBe(0);
      const again = runScript("baseline.mjs", ["base", "a", "b"]);
      expect(again.status).toBe(1);
      expect(again.stderr).toMatch(/already exists/);
      expect(runScript("baseline.mjs", ["base", "a", "b", "--force"]).status).toBe(0);
    });

    test("baseline refuses runs that aren't replicates of one setup", () => {
      const cases: Array<[Overrides, RegExp]> = [
        [{ generator: { commits: ["abc", "def"] } }, /mixes code versions/],
        [{ generator: { promptSetHash: "other" } }, /generator.promptSetHash differs/],
        [{ generator: { model: "anthropic/claude-sonnet-5.5" } }, /generator.model differs/],
        [{ generator: { resolvedModelSet: ["m2"] } }, /generator.resolvedModelSet differs/],
        [{ generator: { resolvedModelSet: ["m1", "m2"] } }, /mixes models/],
        [{ batches: { failed: ["s03"] } }, /has failed seeds/],
        [{ library: { sizes: [{ publicQuestions: 240, withEmbedding: 240 }] } }, /library sizes differ/],
        [{ library: { sizes: [{ publicQuestions: 205, withEmbedding: 205 }, { publicQuestions: 206, withEmbedding: 206 }] } }, /spans library changes/],
      ];
      for (const [overrides, message] of cases) {
        const result = baselineOf(["a", 80], ["b", 82, overrides]);
        expect(result.status, String(message)).toBe(1);
        expect(result.stderr, String(message)).toMatch(message);
      }
    });

    test("compare decides primary rates with Bonferroni: a clear change is different, a borderline one isn't", () => {
      baselineOf(["a", 80], ["b", 82]);
      const changed = { generator: { promptSetHash: "new-prompts" } };
      writeRun("clear", { "summary.json": summary("clear", 55, changed) });
      writeRun("borderline", { "summary.json": summary("borderline", 70, changed) });

      const clear = runScript("compare.mjs", ["base", "clear"]);
      expect(clear.status, clear.stderr).toBe(0);
      const clearResult = readRunFile("clear/comparison-base.json");
      expect(clearResult.changed).toEqual(["generator.promptSetHash"]);
      expect(clearResult.primary.passRate).toMatchObject({ result: "different", baseline: 0.81, run: 0.55 });
      expect(clearResult.different).toContain("passRate");

      runScript("compare.mjs", ["base", "borderline"]);
      const borderline = readRunFile("borderline/comparison-base.json").primary.passRate;
      // p is about 0.04: below 0.05, but not below 0.05 / 7.
      expect(borderline.p).toBeGreaterThan(0.05 / 7);
      expect(borderline.p).toBeLessThan(0.05);
      expect(borderline.result).toBe("not detected");
      expect(borderline.detectable.below).toBeLessThan(0.7);
    });

    test("compare pools several runs, swaps in no-fit rates when definitions change, and flags missing data", () => {
      baselineOf(["a", 80], ["b", 82]);
      const newDefinitions = { generator: { definitionsHash: "new-defs" }, rates: { passRateWithoutFit: rate(80, 100), libraryLikelyRate: rate(0, 0) } };
      writeRun("x1", { "summary.json": summary("x1", 50, newDefinitions) });
      writeRun("x2", { "summary.json": summary("x2", 52, newDefinitions) });

      const result = runScript("compare.mjs", ["base", "x1", "x2"]);
      expect(result.status, result.stderr).toBe(0);
      const comparison = readRunFile("x1/comparison-base.json");
      expect(comparison.warnings.join(" ")).toMatch(/decided without the fit questions/);
      expect(comparison.primary.passRate).toMatchObject({ decidedBy: "passRateWithoutFit", result: "not detected", runCounts: [160, 200] });
      expect(comparison.primary.libraryLikelyRate.result).toBe("no data");
      // The fixture only has a few rates; the point is that an empty rate isn't read as unchanged.
      expect(comparison.noData).toContain("libraryLikelyRate");
      expect(comparison.noData).not.toContain("passRate");
      expect(result.stdout).toMatch(/NO DATA\s+libraryLikelyRate/);
    });

    test("compare doesn't warn about questions matching more than one library question", () => {
      // The save step treats any of them as the existing copy, so the comparison stays fair.
      baselineOf(["a", 80], ["b", 82]);
      writeRun("dupes", { "summary.json": summary("dupes", 80, { batches: { fingerprintCollisions: 2 } }) });

      const result = runScript("compare.mjs", ["base", "dupes"]);
      expect(result.status, result.stderr).toBe(0);
      expect(readRunFile("dupes/comparison-base.json").warnings).toEqual([]);
    });

    test("compare names the model each side asked for, and otherwise says when the preset resolved differently", () => {
      const preset = { model: "@preset/break-the-ice-berg-default" };
      baselineOf(["a", 80, { generator: preset }], ["b", 82, { generator: preset }]);
      writeRun("sonnet", {
        "summary.json": summary("sonnet", 80, { generator: { model: "anthropic/claude-sonnet-5.5", resolvedModelSet: ["anthropic/claude-sonnet-5.5"] } }),
      });
      writeRun("rerouted", { "summary.json": summary("rerouted", 80, { generator: { ...preset, resolvedModelSet: ["m2"] } }) });

      const sonnet = runScript("compare.mjs", ["base", "sonnet"]);
      expect(sonnet.status, sonnet.stderr).toBe(0);
      const sonnetResult = readRunFile("sonnet/comparison-base.json");
      expect(sonnetResult.changed).toEqual(["generator.model", "generator.resolvedModelSet"]);
      // Asking for another model is why it resolved differently, so that isn't warned about twice.
      expect(sonnetResult.warnings).toEqual([
        "The runs asked for anthropic/claude-sonnet-5.5; base asked for @preset/break-the-ice-berg-default.",
      ]);
      expect(sonnet.stdout).toMatch(/Changed: generator\.model, generator\.resolvedModelSet/);
      expect(sonnet.stdout).toMatch(/Warning: The runs asked for anthropic\/claude-sonnet-5\.5; base asked for @preset/);

      const rerouted = runScript("compare.mjs", ["base", "rerouted"]);
      expect(rerouted.status, rerouted.stderr).toBe(0);
      const reroutedResult = readRunFile("rerouted/comparison-base.json");
      expect(reroutedResult.changed).toEqual(["generator.resolvedModelSet"]);
      expect(reroutedResult.warnings).toEqual(["The preset resolved to a different model."]);
    });

    test("compare names a model that resolved differently without blaming the preset", () => {
      const sonnet = { model: "anthropic/claude-sonnet-5.5", resolvedModelSet: ["anthropic/claude-sonnet-5.5"] };
      baselineOf(["a", 80, { generator: sonnet }], ["b", 82, { generator: sonnet }]);
      writeRun("later", { "summary.json": summary("later", 80, { generator: { ...sonnet, resolvedModelSet: ["anthropic/claude-sonnet-5.5-20261101"] } }) });

      const later = runScript("compare.mjs", ["base", "later"]);
      expect(later.status, later.stderr).toBe(0);
      expect(readRunFile("later/comparison-base.json").warnings).toEqual(["anthropic/claude-sonnet-5.5 resolved to a different model."]);
    });

    test("compare refuses runs it can't fairly compare", () => {
      baselineOf(["a", 80], ["b", 82]);
      const cases: Array<[string[], Overrides[], RegExp]> = [
        [["refit"], [{ judge: { cutoffsHash: "refit" } }], /judge.cutoffsHash differs from base's/],
        [["rescored"], [{ judge: { scoringVersion: SCORING_VERSION + 1 } }], /judge.scoringVersion differs/],
        [["failed"], [{ batches: { failed: ["s03"] } }], /failed has failed seeds/],
        [["m1", "m2"], [{}, { generator: { promptSetHash: "other" } }], /aren't one setup/],
        [["p1", "s1"], [{}, { generator: { model: "anthropic/claude-sonnet-5.5" } }], /the runs differ in generator.model, so they aren't one setup/],
        [["mixed"], [{ generator: { resolvedModelSet: ["m1", "m2"] } }], /mixed mixes models/],
        [["c1", "c2"], [{}, { generator: { runIdsHash: "ids-c1" } }], /a run is listed twice/],
        [["a"], [{}], /a is one of base's own runs/],
        [["mixed"], [{ generator: { commits: ["abc", "def"] } }], /mixed mixes code versions/],
      ];
      for (const [runs, overrides, message] of cases) {
        runs.forEach((run, i) => writeRun(run, { "summary.json": summary(run, 80, overrides[i]) }));
        const result = runScript("compare.mjs", ["base", ...runs]);
        expect(result.status, String(message)).toBe(1);
        expect(result.stderr, String(message)).toMatch(message);
      }
    });
  });
});
