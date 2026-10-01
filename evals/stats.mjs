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

function wilsonBounds(k, n, z = 1.96) {
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** 95% Wilson interval for `k` of `n`, as [low, high]; null when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  return wilsonBounds(k, n, z).map((bound) => round(bound));
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

const logFactorials = [0];
function logFactorial(n) {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}

/**
 * Fisher's exact test of k2 of n2 against k1 of n1, two-sided. Exact, so it stays honest for the
 * small counts most of these rates have. Returns the unrounded p-value, for deciding.
 */
export function fisherExact(k1, n1, k2, n2) {
  if (!n1 || !n2) return null;
  const total = n1 + n2;
  const successes = k1 + k2;
  const logChoose = (n, k) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  const probability = (x) => Math.exp(logChoose(successes, x) + logChoose(total - successes, n1 - x) - logChoose(total, n1));
  const observed = probability(k1);
  let p = 0;
  for (let x = Math.max(0, successes - n2); x <= Math.min(successes, n1); x++) {
    const px = probability(x);
    if (px <= observed * (1 + 1e-7)) p += px;
  }
  return Math.min(1, p);
}

/** 95% interval for the difference k2/n2 minus k1/n1 (Newcombe's hybrid score method). */
export function differenceInterval(k1, n1, k2, n2) {
  if (!n1 || !n2) return null;
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const [l1, u1] = wilsonBounds(k1, n1);
  const [l2, u2] = wilsonBounds(k2, n2);
  const diff = p2 - p1;
  return [round(diff - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2)), round(diff + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2))];
}

/**
 * The rates a run of size n2 would have to reach, below and above the baseline, before the test
 * could call it different at `alpha`. Null on a side where no count would be enough.
 */
export function detectableRange(k1, n1, n2, alpha) {
  if (!n1 || !n2) return null;
  const expected = Math.round((k1 / n1) * n2);
  let below = null;
  for (let k2 = expected; k2 >= 0; k2--) {
    if (fisherExact(k1, n1, k2, n2) < alpha) {
      below = round(k2 / n2);
      break;
    }
  }
  let above = null;
  for (let k2 = expected; k2 <= n2; k2++) {
    if (fisherExact(k1, n1, k2, n2) < alpha) {
      above = round(k2 / n2);
      break;
    }
  }
  return { below, above };
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
 * Bump when the logic that turns answers into rates changes (verdicts, denominators, which
 * questions count). Runs scored under different versions aren't comparable: rescore the baseline.
 */
export const SCORING_VERSION = 2;

/** What must match for a run to be compared with a baseline at all: the measuring stick. */
export const COMPARABLE_KEYS = [
  "judge.questionSetHash",
  "judge.cutoffsHash",
  "judge.scoringVersion",
  "generator.seedSetHash",
  "generator.batchSize",
  "generator.neighbours",
];
/**
 * What must also match for runs to be replicates of one setup. A comparison reports these as what
 * changed: prompts, the taxonomy and definitions they came from, sampling, the model the preset
 * resolved to, and the deployed code's settings.
 */
export const REPLICATE_KEYS = [
  ...COMPARABLE_KEYS,
  "generator.promptSetHash",
  "generator.definitionsHash",
  "generator.taxonomyHash",
  "generator.temperatures",
  "generator.resolvedModelSet",
  "generator.settingsHash",
];

/** The keys whose values differ across summaries. */
export function identityMismatches(summaries, keys) {
  return keys.filter((key) => new Set(summaries.map((summary) => JSON.stringify(pick(summary, key)))).size > 1);
}

/**
 * The rates a comparison decides on, chosen before looking at any comparison. Each counts
 * independent units (questions, batches or model calls), and they're tested together with a
 * Bonferroni correction; every other rate is exploratory.
 */
export const PRIMARY_RATES = [
  "passRate",
  "reviewRate",
  "blockRate",
  "libraryLikelyRate",
  "batchLikelyRate",
  "unusableOutputRate",
  "yieldRate",
];
/** When definitions change, fit is graded against different text, so these stand in for pass and review. */
export const WITHOUT_FIT = { passRate: "passRateWithoutFit", reviewRate: "reviewRateWithoutFit" };
export const FAMILY_ALPHA = 0.05;

/** Sample standard deviation; null for fewer than two values. */
export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1));
}
