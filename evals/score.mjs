// Scores a generated run with Jev and code checks, and writes scores.json and summary.json next to
// it. Usage: node evals/score.mjs <run-name> [--force]   (needs TYPESAFE_API_KEY in the environment)
// --force overwrites a summary scored with a different Jev version, question wording, cutoffs or
// scoring version.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUTOFFS_HASH,
  DUP_LIKELY,
  DUP_REVIEW,
  FIT_IDS,
  FIT_TOPIC,
  GATE_QUESTIONS,
  JEV_MODEL,
  JevClient,
  QUALITY_CUTOFFS,
  QUESTION_SET_HASH,
  SAFETY_BLOCK,
  SAFETY_IDS,
  SAFETY_REVIEW,
  answerValues,
  dupRequest,
  dupVerdict,
  gateRequest,
  gateVerdict,
} from "./jev.mjs";
import { mapLimit } from "./async.mjs";
import { SCORING_VERSION, failureReason, frameStats, hashOf, mean, median, rate, round, tally, wilson } from "./stats.mjs";

// Jev requests in flight at once, however the steps below nest them.
const CONCURRENCY = 8;
// The admin duplicate scan flags a pair above this cosine (detectDuplicateQuestionsStreaming).
const DETECTOR_COSINE_CUTOFF = 0.95;
// Failures the prompt or the model's output can cause: an answer that can't be read, has no
// questions, or was cut off by the cap. Everything else (a provider error, an empty answer ending
// in error) is infrastructure and is reported separately.
const UNUSABLE_OUTPUT = /could not be read|had no questions|finish_reason=length|cut off/;

const [run, ...flags] = process.argv.slice(2);
if (!run) {
  console.error("Usage: node evals/score.mjs <run-name> [--force]");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const runDir = join(here, "runs", run);
const generatedPath = join(runDir, "generated.json");
if (!existsSync(generatedPath)) {
  console.error(`No generated.json for run "${run}". Run node evals/generate.mjs ${run} first.`);
  process.exit(1);
}
const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
const summaryPath = join(runDir, "summary.json");
if (existsSync(summaryPath) && !flags.includes("--force")) {
  const judged = JSON.parse(readFileSync(summaryPath, "utf8")).judge;
  const now = `${QUESTION_SET_HASH}/${CUTOFFS_HASH}/v${SCORING_VERSION}`;
  const then = `${judged?.questionSetHash ?? "unknown"}/${judged?.cutoffsHash ?? "unknown"}/v${judged?.scoringVersion ?? "?"}`;
  if (then !== now) {
    console.error(`summary.json was scored with a different Jev version, question wording, cutoffs or scoring version (${then}, now ${now}). Pass --force to rescore it.`);
    process.exit(1);
  }
}
// Every successful batch's model call must be in the run's generation records, or the cost,
// model and failure counts would silently undercount.
const okBatches = generated.batches.filter((batch) => batch.ok);
const unsettled = (generated.attempts ?? []).filter((a) => a.status !== "succeeded" && a.status !== "failed");
if (unsettled.length) {
  console.error(`${unsettled.length} generation run(s) hadn't finished when they were read. Rerun node evals/generate.mjs ${run} to refresh them.`);
  process.exit(1);
}
const recorded = new Set((generated.attempts ?? []).filter((a) => a.status === "succeeded").map((a) => a.runId));
const unrecorded = okBatches.filter((batch) => !recorded.has(batch.result.runId)).map((batch) => batch.seed.id);
if (unrecorded.length) {
  console.error(`Generation records are missing for ${unrecorded.join(", ")}. Rerun node evals/generate.mjs ${run} to fetch them.`);
  process.exit(1);
}
const jev = new JevClient({ apiKey: process.env.TYPESAFE_API_KEY, cachePath: join(runDir, "jev-cache.jsonl"), maxConcurrent: CONCURRENCY });

/** Both orders, averaged: swapping the questions changed Jev's level on about 1 pair in 6. */
async function comparePair(a, b) {
  const [ab, ba] = await Promise.all([jev.ask(dupRequest(a, b)), jev.ask(dupRequest(b, a))]);
  const x = answerValues(ab.answers);
  const y = answerValues(ba.answers);
  const dupLevel = round((x.dup_level + y.dup_level) / 2);
  return {
    dupLevel,
    sameAnswer: round((x.same_answer + y.same_answer) / 2),
    sameTemplate: round((x.same_template + y.same_template) / 2),
    verdict: dupVerdict(dupLevel),
  };
}

function pairsWithin(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) pairs.push({ a: items[i], b: items[j] });
  }
  return pairs;
}

const candidates = okBatches.flatMap((batch) =>
  batch.result.candidates.map((candidate, i) => ({
    id: `${batch.seed.id}-${i + 1}`,
    seed: batch.seed,
    definitions: batch.result.definitions,
    ...candidate,
  })),
);
console.log(`Scoring ${candidates.length} questions from ${okBatches.length} batches.`);

// Quality and safety gate, one request per question.
await mapLimit(candidates, CONCURRENCY, async (candidate) => {
  const values = Object.fromEntries(
    Object.entries(answerValues((await jev.ask(gateRequest(candidate))).answers)).map(([id, value]) => [id, round(value)]),
  );
  candidate.gate = { values, ...gateVerdict(values), withoutFit: gateVerdict(values, { ignore: FIT_IDS }).verdict };
});

// Duplicates: each question against its library neighbours, pairs within each batch, and pairs
// across batches of the same style (the clustering a shared library builds up). Exact copies the
// save step already caught count as duplicates without asking Jev; everything else is compared,
// including questions the code checks rejected, so a prompt can't hide duplicates behind them.
const saved = candidates.filter((candidate) => candidate.outcome === "saved");
const compared = candidates.filter((candidate) => candidate.outcome !== "duplicate");
await mapLimit(compared, CONCURRENCY, async (candidate) => {
  candidate.library = await Promise.all(
    (candidate.neighbours ?? []).map(async (neighbour) => ({
      ...neighbour,
      ...(await comparePair(candidate.text, neighbour.text)),
    })),
  );
});
const batchPairs = okBatches.flatMap((batch) => pairsWithin(compared.filter((c) => c.seed.id === batch.seed.id)));
const crossPairs = [...new Set(compared.map((c) => c.seed.style))].flatMap((style) =>
  pairsWithin(compared.filter((c) => c.seed.style === style)).filter((pair) => pair.a.seed.id !== pair.b.seed.id),
);
await mapLimit([...batchPairs, ...crossPairs], CONCURRENCY, async (pair) => {
  Object.assign(pair, await comparePair(pair.a.text, pair.b.text));
});

const judgeVersions = Object.keys(jev.usage.models);
if (judgeVersions.length !== 1 || judgeVersions[0] !== JEV_MODEL) {
  console.error(`Expected every answer from ${JEV_MODEL}, got ${JSON.stringify(jev.usage.models)}. Not writing a mixed summary.`);
  process.exit(1);
}

// Summary.
const valuesOf = (items, id) => items.map((candidate) => candidate.gate.values[id]).filter((value) => value !== undefined);
const questionTypes = Object.entries({ ...GATE_QUESTIONS, fit_topic: FIT_TOPIC }).filter(([id]) => !SAFETY_IDS.includes(id));
const scoreIds = questionTypes.filter(([, q]) => q.type === "score").map(([id]) => id);
const noulIds = questionTypes.filter(([, q]) => q.type === "noul").map(([id]) => id);
const count = (items, test) => items.filter(test).length;
const verdictCount = (items, verdict, key = "verdict") => count(items, (c) => c.gate[key] === verdict);
const seedKey = (batch) => batch.seed.id;
// Questions whose library search failed or found nothing are left out of the library figures.
const checked = compared.filter((candidate) => candidate.library.length > 0);
const libraryBest = checked.map((candidate) => ({
  level: Math.max(...candidate.library.map((match) => match.dupLevel)),
  cosine: Math.max(...candidate.library.map((match) => match.cosine)),
}));
const libraryCopies = count(candidates, (c) => c.duplicateOf === "library");
const runAttempts = generated.attempts ?? [];
const failedAttempts = runAttempts.filter((a) => a.status === "failed");
const unusable = (attempt) => UNUSABLE_OUTPUT.test(attempt.error ?? "");
const batchFailures = generated.batches.flatMap((batch) => batch.failures ?? []);
// A batch has a duplicate when two of its questions are exact copies or Jev calls them likely.
// Counted per batch, not per pair: a batch's 10 pairs share questions, so they aren't independent.
const batchesWithDuplicate = okBatches.filter(
  (batch) =>
    candidates.some((c) => c.seed.id === batch.seed.id && c.duplicateOf === "batch") ||
    batchPairs.some((pair) => pair.a.seed.id === batch.seed.id && pair.verdict === "likely"),
);
const settings = [...new Set(okBatches.map((batch) => JSON.stringify(batch.result.settings ?? null)))].map((value) => JSON.parse(value));

// Rates with their counts, so runs with different denominators compare fairly and pool across
// replicates. Gate rates are over every generated question, before the code checks, so a prompt
// can't look safer by having the regex drop its worst questions.
const rates = {
  passRate: rate(verdictCount(candidates, "pass"), candidates.length),
  reviewRate: rate(verdictCount(candidates, "review"), candidates.length),
  blockRate: rate(verdictCount(candidates, "block"), candidates.length),
  libraryLikelyRate: rate(libraryCopies + count(libraryBest, (best) => best.level >= DUP_LIKELY), libraryCopies + libraryBest.length),
  batchLikelyRate: rate(batchesWithDuplicate.length, okBatches.length),
  unusableOutputRate: rate(count(failedAttempts, unusable), runAttempts.length),
  yieldRate: rate(candidates.length, okBatches.length * generated.batchSize),
  passRateWithoutFit: rate(verdictCount(candidates, "pass", "withoutFit"), candidates.length),
  reviewRateWithoutFit: rate(verdictCount(candidates, "review", "withoutFit"), candidates.length),
  providerErrorRate: rate(count(failedAttempts, (a) => !unusable(a)), runAttempts.length),
  savedRate: rate(saved.length, candidates.length),
  codeRejectRate: rate(count(candidates, (c) => c.outcome === "rejected"), candidates.length),
  exactDuplicateRate: rate(count(candidates, (c) => c.outcome === "duplicate"), candidates.length),
  savedPassRate: rate(verdictCount(saved, "pass"), saved.length),
  libraryReviewRate: rate(count(libraryBest, (best) => dupVerdict(best.level) === "review"), libraryBest.length),
  withinBatchLikelyPairRate: rate(count(batchPairs, (pair) => pair.verdict === "likely"), batchPairs.length),
  crossBatchLikelyRate: rate(count(crossPairs, (pair) => pair.verdict === "likely"), crossPairs.length),
  ...Object.fromEntries(
    SAFETY_IDS.map((id) => [`${id}FlagRate`, rate(count(candidates, (c) => c.gate.values[id] >= SAFETY_REVIEW), candidates.length)]),
  ),
};

const summary = {
  run,
  deployment: generated.deployment,
  generatedAt: generated.createdAt,
  scoredAt: new Date().toISOString(),
  generator: {
    regime: `admin preview path, a batch of ${generated.batchSize} per call, no per-person exclusion list (the feed usually asks for 1 and excludes recently seen questions)`,
    model: okBatches[0]?.result.model,
    resolvedModels: tally(runAttempts.map((attempt) => attempt.resolvedModel).filter(Boolean)),
    resolvedModelSet: [...new Set(runAttempts.map((attempt) => attempt.resolvedModel).filter(Boolean))].sort(),
    // What the deployed code used: output cap, retries, neighbours. A run against different code shows here.
    settings,
    settingsHash: hashOf(okBatches.map((batch) => [seedKey(batch), batch.result.settings ?? null]).sort()),
    neighbours: settings.length === 1 ? (settings[0]?.neighbours ?? null) : null,
    commits: [...new Set(okBatches.map((batch) => batch.commit).filter(Boolean))],
    // Fingerprints that tell replicates apart from runs of a changed prompt, seed set or taxonomy.
    promptSetHash: hashOf(okBatches.map((batch) => [seedKey(batch), batch.result.promptHash]).sort()),
    definitionsHash: hashOf(okBatches.map((batch) => [seedKey(batch), batch.result.definitions]).sort()),
    taxonomyHash: hashOf(
      okBatches.map((batch) => [seedKey(batch), batch.result.blueprint, batch.result.style, batch.result.tone, batch.result.topic]).sort(),
    ),
    seedSetHash: hashOf(okBatches.map((batch) => batch.seed).sort((a, b) => a.id.localeCompare(b.id))),
    temperatures: [...new Set(okBatches.map((batch) => batch.result.temperature))],
    batchSize: generated.batchSize,
    costUsd: round(runAttempts.reduce((sum, attempt) => sum + (attempt.costUsd ?? 0), 0), 4),
    maxCompletionTokens: Math.max(0, ...runAttempts.map((attempt) => attempt.completionTokens ?? 0)),
  },
  batches: {
    ok: okBatches.length,
    failed: generated.batches.filter((batch) => !batch.ok).map((batch) => batch.seed.id),
    // One generation run per model call the generator made, including its own retries of unusable
    // answers. Provider-level retries inside one call (429s, timeouts) share that call's run.
    generationRuns: {
      total: runAttempts.length,
      failed: failedAttempts.length,
      unusableOutput: count(failedAttempts, unusable),
      providerErrors: count(failedAttempts, (a) => !unusable(a)),
      failureReasons: tally(failedAttempts.map((a) => failureReason(a.error))),
    },
    // Calls that never reached the model, or never came back, by the step they broke at.
    otherFailures: tally(batchFailures.filter((failure) => failure.stage !== "generation").map((failure) => failure.stage)),
    fingerprintCollisions: okBatches.reduce((sum, batch) => sum + (batch.result.fingerprintCollisions ?? 0), 0),
  },
  library: {
    sizes: [...new Set((generated.invocations ?? []).map((inv) => JSON.stringify(inv.library)))].map((size) => JSON.parse(size)),
    questionsChecked: checked.length,
    questionsWithoutNeighbours: compared.length - checked.length,
    searchErrors: count(compared, (candidate) => candidate.neighbourError),
  },
  rates,
  pipeline: {
    parsed: candidates.length,
    saved: saved.length,
    duplicate: tally(candidates.filter((c) => c.outcome === "duplicate").map((c) => c.duplicateOf)),
    rejected: count(candidates, (c) => c.outcome === "rejected"),
    rejectionReasons: tally(candidates.flatMap((c) => c.codeRejections)),
    curlyQuotes: count(candidates, (c) => /[‘’“”]/.test(c.text)),
  },
  gate: {
    note: "Safety cutoffs are the plan's; quality cutoffs are provisional until refit on the owner's labels.",
    cutoffs: { safetyBlock: SAFETY_BLOCK, safetyReview: SAFETY_REVIEW, quality: QUALITY_CUTOFFS },
    allParsed: { ...tally(candidates.map((c) => c.gate.verdict)), passRate95: wilson(verdictCount(candidates, "pass"), candidates.length) },
    saved: tally(saved.map((c) => c.gate.verdict)),
    reasons: tally(candidates.flatMap((c) => c.gate.reasons)),
  },
  // Over every generated question, like the gate rates.
  safety: Object.fromEntries(
    SAFETY_IDS.map((id) => [
      id,
      {
        mean: round(mean(valuesOf(candidates, id))),
        review: valuesOf(candidates, id).filter((v) => v >= SAFETY_REVIEW && v < SAFETY_BLOCK).length,
        block: valuesOf(candidates, id).filter((v) => v >= SAFETY_BLOCK).length,
      },
    ]),
  ),
  // Over saved questions: the quality of what would go live.
  quality: Object.fromEntries([
    ...scoreIds.map((id) => [id, { mean: round(mean(valuesOf(saved, id)), 2), levels: tally(valuesOf(saved, id).map((v) => Math.round(v))) }]),
    ...noulIds.map((id) => {
      const values = valuesOf(saved, id);
      return [id, { n: values.length, mean: round(mean(values)), below05: values.filter((v) => v < 0.5).length }];
    }),
  ]),
  duplicates: {
    note: `Mean dup_level over both orders: ${DUP_LIKELY} and up likely, ${DUP_REVIEW} to ${DUP_LIKELY} review.`,
    withinBatch: { batches: okBatches.length, withDuplicate: batchesWithDuplicate.length, pairs: batchPairs.length, ...tally(batchPairs.map((pair) => pair.verdict)) },
    acrossBatchesSameStyle: { pairs: crossPairs.length, ...tally(crossPairs.map((pair) => pair.verdict)) },
    library: {
      questions: checked.length,
      exactCopies: libraryCopies,
      likely: count(libraryBest, (best) => dupVerdict(best.level) === "likely"),
      review: count(libraryBest, (best) => dupVerdict(best.level) === "review"),
      topCosineMedian: round(median(libraryBest.map((best) => best.cosine))),
      topCosineOverDetectorCutoff: count(libraryBest, (best) => best.cosine > DETECTOR_COSINE_CUTOFF),
    },
  },
  // Informational: pooled repetition mostly reflects styles that require their opener, and the
  // cross-style share swings a lot between replicates.
  frames: frameStats(saved.map((c) => ({ text: c.text, style: c.seed.style }))),
  judge: { model: JEV_MODEL, questionSetHash: QUESTION_SET_HASH, cutoffsHash: CUTOFFS_HASH, scoringVersion: SCORING_VERSION },
  jev: jev.usage,
};

const strip = ({ a, b, ...pair }) => ({ a: a.id, b: b.id, ...pair });
const scores = {
  run,
  candidates: candidates.map(({ definitions, neighbours, ...candidate }) => candidate),
  batchPairs: batchPairs.map(strip),
  crossPairs: crossPairs.map(strip),
};
writeFileSync(join(runDir, "scores.json"), `${JSON.stringify(scores, null, 2)}\n`);
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
