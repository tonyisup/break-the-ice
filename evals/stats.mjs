// Small pure helpers for the eval summary, baseline and comparison. Kept apart from the scripts so
// they can be tested.
import { createHash } from "node:crypto";

/** A short, stable fingerprint of any JSON value. */
export const hashOf = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** Rounds to `places` decimals; null for a missing or non-finite value instead of a fake 0. */
export const round = (n, places = 3) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** places) / 10 ** places : null;

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Counts of each value, most common first. */
export const tally = (xs) =>
  Object.fromEntries([...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));

/** 95% Wilson interval for `k` of `n`, as [low, high]; null when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}

/** A question's opening three words: the sentence frame it reuses most visibly. */
export function frame(text) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

// A frame counts as repeated when at least this many questions, and this share of the run, use it.
export const MIN_REPEATED_FRAME_COUNT = 3;
export const REPEATED_FRAME_SHARE = 0.05;

/**
 * Repeated sentence frames, pooled and across styles. Some styles require their opener ("Would
 * you rather", "One word only"), so the pooled share mostly reflects the seeds. The cross-style
 * share counts questions whose opener also starts a question of another style, which is the
 * repetition a prompt change can actually move.
 */
export function frameStats(items) {
  const frames = items.map((item) => ({ frame: frame(item.text), style: item.style }));
  const counts = tally(frames.map((f) => f.frame));
  const repeatAt = Math.max(MIN_REPEATED_FRAME_COUNT, Math.ceil(items.length * REPEATED_FRAME_SHARE));
  const stylesByFrame = new Map();
  for (const f of frames) stylesByFrame.set(f.frame, (stylesByFrame.get(f.frame) ?? new Set()).add(f.style));
  const crossStyle = frames.filter((f) => stylesByFrame.get(f.frame).size > 1);
  return {
    repeatAt,
    distinct: Object.keys(counts).length,
    repeatedShare: round(frames.filter((f) => counts[f.frame] >= repeatAt).length / (items.length || 1)),
    crossStyleShare: round(crossStyle.length / (items.length || 1)),
    top: Object.entries(counts).slice(0, 10),
    topCrossStyle: Object.entries(tally(crossStyle.map((f) => f.frame))).slice(0, 10),
  };
}

/** A failed attempt's error without request ids, character positions or stack lines, so like failures group. */
export function failureReason(message) {
  const text = String(message ?? "");
  const convexMessage = text.match(/"message":"([^"]+)"/)?.[1];
  return (convexMessage ?? text)
    .replace(/^.*?Uncaught (Convex)?Error: /, "")
    .replace(/ at position \d+.*$/, "")
    .replace(/\s+at async .*$/, "")
    .slice(0, 100);
}

/** A count and its denominator, with the rate. */
export const rate = (k, n) => ({ k, n, rate: n ? round(k / n) : null });

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Two-proportion z-test of k2/n2 against k1/n1: the difference and its two-sided p-value. Questions
 * in one batch aren't independent, so treat p-values as optimistic.
 */
export function twoProportionTest(k1, n1, k2, n2) {
  if (!n1 || !n2) return { diff: null, p: null };
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { diff: round(p2 - p1), p: p1 === p2 ? 1 : 0 };
  const z = (p2 - p1) / se;
  return { diff: round(p2 - p1), p: round(2 * (1 - normalCdf(Math.abs(z))), 4) };
}

/** Adds up each rate's counts across runs into one pooled rate with a 95% interval. */
export function poolRates(rateSets) {
  const names = [...new Set(rateSets.flatMap((rates) => Object.keys(rates)))].sort();
  return Object.fromEntries(
    names.map((name) => {
      const k = rateSets.reduce((sum, rates) => sum + (rates[name]?.k ?? 0), 0);
      const n = rateSets.reduce((sum, rates) => sum + (rates[name]?.n ?? 0), 0);
      return [name, { ...rate(k, n), interval95: wilson(k, n), perRun: rateSets.map((rates) => rates[name]?.rate ?? null) }];
    }),
  );
}

export const pick = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

/**
 * What must match for runs to be replicates of one setup: the judge, its cutoffs, the seeds, the
 * prompts (and the taxonomy and definitions they came from) and the sampling settings.
 */
export const REPLICATE_KEYS = [
  "judge.questionSetHash",
  "judge.cutoffsHash",
  "generator.seedSetHash",
  "generator.promptSetHash",
  "generator.definitionsHash",
  "generator.taxonomyHash",
  "generator.batchSize",
  "generator.temperatures",
];
/** What must match for a run to be compared with a baseline at all. The rest is what a change may change. */
export const COMPARABLE_KEYS = ["judge.questionSetHash", "judge.cutoffsHash", "generator.seedSetHash", "generator.batchSize"];

/** The keys whose values differ across summaries. */
export function identityMismatches(summaries, keys) {
  return keys.filter((key) => new Set(summaries.map((summary) => JSON.stringify(pick(summary, key)))).size > 1);
}

/**
 * The rates a comparison decides on, chosen before looking at any comparison. Tested together with a
 * Bonferroni correction; every other rate is reported as exploratory.
 */
export const PRIMARY_RATES = [
  "passRate",
  "blockRate",
  "reviewRate",
  "libraryLikelyRate",
  "withinBatchLikelyRate",
  "generationFailureRate",
];
export const FAMILY_ALPHA = 0.05;

/** Sample standard deviation; null for fewer than two values. */
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1));
}
