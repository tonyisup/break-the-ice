// The eval harness's local Node tooling (evals/*.mjs). Nothing here touches the network: fetch is
// stubbed, and generate.mjs is only run far enough to hit its guards.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  mapLimit,
} from "../evals/jev.mjs";
import { classifyFailure, mergeAttempts, orderedBatches, pendingSeeds, recordFailure, recordSuccess } from "../evals/runRecord.mjs";
import {
  COMPARABLE_KEYS,
  REPLICATE_KEYS,
  failureReason,
  frame,
  frameStats,
  hashOf,
  identityMismatches,
  median,
  normalCdf,
  poolRates,
  rate,
  round,
  sd,
  tally,
  twoProportionTest,
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
  test("the two-proportion test matches known values", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(twoProportionTest(50, 100, 50, 100)).toEqual({ diff: 0, p: 1 });
    const drop = twoProportionTest(80, 100, 60, 100);
    expect(drop.diff).toBe(-0.2);
    expect(drop.p).toBeCloseTo(0.0019, 3);
    expect(twoProportionTest(0, 100, 0, 100)).toEqual({ diff: 0, p: 1 });
    expect(twoProportionTest(1, 0, 1, 10)).toEqual({ diff: null, p: null });
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
    expect(hashOf({ a: 1 })).toBe(hashOf({ a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
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

  test("fetched generation runs are added once each", () => {
    const a = { runId: "r1", status: "failed" };
    const b = { runId: "r2", status: "succeeded" };
    expect(mergeAttempts([a], [a, b])).toEqual([a, b]);
  });
});

describe("script guards", () => {
  const evalsDir = join(__dirname, "..", "evals");
  const scratchRuns = ["guard-test", "Bad Name", "no-such-run", "guard-a", "guard-b", "guard-new"];
  const scratchFiles = ["guard-base.json"];
  // No inherited environment and an unusable PATH: if a guard ever regressed, the script would
  // fail to find npx instead of generating (and paying for) a run on dev.
  const runScript = (name: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(evalsDir, name), ...args], {
      env: { PATH: "/nonexistent", ...env },
      encoding: "utf8",
      timeout: 10_000,
    });
  afterEach(() => {
    for (const run of scratchRuns) rmSync(join(evalsDir, "runs", run), { recursive: true, force: true });
    for (const file of scratchFiles) rmSync(join(evalsDir, "runs", file), { force: true });
  });
  const writeRun = (run: string, summary: unknown, generated: unknown = { batches: [] }) => {
    const dir = join(evalsDir, "runs", run);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "generated.json"), JSON.stringify(generated));
    if (summary) writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  };

  test("generate refuses a bad run name and a non-dev deployment before doing anything", () => {
    const badName = runScript("generate.mjs", ["Bad Name"]);
    expect(badName.status).toBe(1);
    expect(badName.stderr).toMatch(/Usage: node evals\/generate\.mjs/);
    expect(existsSync(join(evalsDir, "runs", "Bad Name"))).toBe(false);

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

  test("score needs a run name and a generated run", () => {
    const noRun = runScript("score.mjs", []);
    expect(noRun.status).toBe(1);
    expect(noRun.stderr).toMatch(/Usage: node evals\/score\.mjs/);

    const notGenerated = runScript("score.mjs", ["no-such-run"]);
    expect(notGenerated.status).toBe(1);
    expect(notGenerated.stderr).toMatch(/Run node evals\/generate\.mjs no-such-run first/);
  });

  test("score won't overwrite a summary judged under other wording or cutoffs unless forced", () => {
    writeRun("guard-test", { judge: { questionSetHash: "old", cutoffsHash: CUTOFFS_HASH } });

    const refused = runScript("score.mjs", ["guard-test"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/different Jev version, question wording or cutoffs \(old\//);

    // Forced, it gets past the guard and stops at the missing API key, before any request.
    const forced = runScript("score.mjs", ["guard-test", "--force"]);
    expect(forced.status).toBe(1);
    expect(forced.stderr).toMatch(/TYPESAFE_API_KEY/);
  });

  test("score refuses a run whose generation records are missing", () => {
    writeRun("guard-test", null, {
      batches: [{ seed: { id: "s01" }, ok: true, result: { runId: "r1", candidates: [] } }],
      attempts: [],
    });

    const result = runScript("score.mjs", ["guard-test"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Generation records are missing for s01/);
  });

  test("baseline pools replicates and refuses non-replicates; compare tests a run against it", () => {
    const identity = {
      judge: { questionSetHash: QUESTION_SET_HASH, cutoffsHash: CUTOFFS_HASH },
      generator: {
        seedSetHash: "seeds",
        promptSetHash: "prompts",
        definitionsHash: "defs",
        taxonomyHash: "tax",
        batchSize: 5,
        temperatures: [0.9],
        commits: ["abc"],
        resolvedModels: { m: 20 },
        costUsd: 0.1,
      },
      batches: { failed: [] },
      library: { sizes: [{ publicQuestions: 205, withEmbedding: 205 }] },
      quality: { readability: { mean: 2.5 } },
    };
    const summary = (run: string, pass: number, block: number, overrides: Record<string, unknown> = {}) => ({
      ...identity,
      run,
      rates: { passRate: rate(pass, 100), blockRate: rate(block, 100) },
      ...overrides,
    });
    writeRun("guard-a", summary("guard-a", 80, 1));
    writeRun("guard-b", summary("guard-b", 82, 1));

    const pooled = runScript("baseline.mjs", ["guard-base", "guard-a", "guard-b"]);
    expect(pooled.status, pooled.stderr).toBe(0);
    const baseline = JSON.parse(readFileSync(join(evalsDir, "runs", "guard-base.json"), "utf8"));
    expect(baseline.rates.passRate).toMatchObject({ k: 162, n: 200, rate: 0.81, perRun: [0.8, 0.82] });
    expect(baseline.qualityMeans.readability).toEqual({ perRun: [2.5, 2.5], mean: 2.5, sd: 0 });

    // A changed prompt is a different setup, not a replicate, but it can be compared.
    writeRun("guard-new", summary("guard-new", 55, 9, { generator: { ...identity.generator, promptSetHash: "new-prompts" } }));
    const notReplicates = runScript("baseline.mjs", ["guard-base", "guard-a", "guard-new"]);
    expect(notReplicates.status).toBe(1);
    expect(notReplicates.stderr).toMatch(/generator.promptSetHash differs/);

    const compared = runScript("compare.mjs", ["guard-base", "guard-new"]);
    expect(compared.status, compared.stderr).toBe(0);
    const comparison = JSON.parse(readFileSync(join(evalsDir, "runs", "guard-new", "comparison-guard-base.json"), "utf8"));
    expect(comparison.changed).toEqual(["generator.promptSetHash"]);
    expect(comparison.rates.passRate).toMatchObject({ primary: true, baseline: 0.81, run: 0.55, different: true });
    expect(comparison.differentPrimaryRates).toContain("passRate");

    // A run judged with other cutoffs can't be compared at all.
    writeRun("guard-new", summary("guard-new", 80, 1, { judge: { questionSetHash: QUESTION_SET_HASH, cutoffsHash: "refit" } }));
    const incomparable = runScript("compare.mjs", ["guard-base", "guard-new"]);
    expect(incomparable.status).toBe(1);
    expect(incomparable.stderr).toMatch(/judge.cutoffsHash/);
  });
});
