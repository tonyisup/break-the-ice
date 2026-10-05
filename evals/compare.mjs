// Tests runs of a changed setup against a pooled baseline. Usage:
//   node evals/compare.mjs <baseline-name> <run> [<run>...]
// Several runs of the same setup are pooled first. Each primary rate gets Fisher's exact test,
// Bonferroni-corrected across the primaries; other rates are exploratory. Writes
// evals/runs/<first run>/comparison-<baseline-name>.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJson } from "./runRecord.mjs";
import {
  COMPARABLE_KEYS,
  FAMILY_ALPHA,
  REPLICATE_KEYS,
  WITHOUT_FIT,
  detectableRange,
  differenceInterval,
  fisherExact,
  identityMismatches,
  pick,
  poolRates,
  round,
} from "./stats.mjs";

const [baselineName, ...runs] = process.argv.slice(2);
if (!baselineName || !runs.length) {
  console.error("Usage: node evals/compare.mjs <baseline-name> <run> [<run>...]");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(here, "runs", `${baselineName}.json`), "utf8"));
const summaries = runs.map((run) => JSON.parse(readFileSync(join(here, "runs", run, "summary.json"), "utf8")));
const first = summaries[0];

const runIds = summaries.map((summary) => summary.generator.runIdsHash);
const problems = [
  // Counting the same observations twice, or the baseline's own, would fake a difference.
  ...(new Set(runIds).size < runIds.length ? ["a run is listed twice"] : []),
  ...summaries.filter((summary) => (baseline.runIdsHashes ?? []).includes(summary.generator.runIdsHash)).map((summary) => `${summary.run} is one of ${baselineName}'s own runs`),
  ...summaries.filter((summary) => summary.generator.commits.length !== 1).map((summary) => `${summary.run} mixes code versions`),
  ...identityMismatches(summaries, REPLICATE_KEYS).map((key) => `the runs differ in ${key}, so they aren't one setup`),
  ...COMPARABLE_KEYS.filter((key) => JSON.stringify(baseline.identity[key]) !== JSON.stringify(pick(first, key))).map(
    (key) => `${key} differs from ${baselineName}'s (rescore or regenerate the baseline under the same judge, scoring and seeds)`,
  ),
  ...summaries.filter((summary) => summary.batches.failed.length).map((summary) => `${summary.run} has failed seeds; rerun generate.mjs`),
];
if (problems.length) {
  console.error(`Can't compare: ${problems.join("; ")}.`);
  process.exit(1);
}

// What the runs changed relative to the baseline's setup.
const changed = REPLICATE_KEYS.filter(
  (key) => !COMPARABLE_KEYS.includes(key) && JSON.stringify(baseline.identity[key]) !== JSON.stringify(pick(first, key)),
);
// Changed definitions move the fit questions (part of pass and review), so those are decided
// without fit instead.
const substitutions = changed.includes("generator.definitionsHash") ? WITHOUT_FIT : {};
const warnings = [
  ...(Object.keys(substitutions).length
    ? ["Style, tone or topic definitions changed: passRate and reviewRate are decided without the fit questions."]
    : []),
  ...(changed.includes("generator.model")
    ? [`The runs asked for ${first.generator.model}; ${baselineName} asked for ${baseline.identity["generator.model"]}.`]
    : changed.includes("generator.resolvedModelSet")
      ? ["The preset resolved to a different model."]
      : []),
  ...summaries
    .filter((summary) => JSON.stringify(summary.library.sizes) !== JSON.stringify([baseline.library]))
    .map((summary) => `${summary.run} searched a different library, so library duplicate rates aren't like for like.`),
  ...summaries.filter((summary) => summary.library.searchErrors).map((summary) => `${summary.run} had library search errors.`),
];

const pooled = poolRates(summaries.map((summary) => summary.rates));
const threshold = FAMILY_ALPHA / baseline.primaryRates.length;
const testRate = (name, primary) => {
  const base = baseline.rates[name];
  const current = pooled[name];
  if (!base?.n || !current?.n) return { primary, decidedBy: name, baseline: base?.rate ?? null, run: current?.rate ?? null, result: "no data" };
  const p = fisherExact(base.k, base.n, current.k, current.n);
  return {
    primary,
    decidedBy: name,
    baseline: base.rate,
    baselineInterval95: base.interval95,
    run: current.rate,
    runCounts: [current.k, current.n],
    diff: round(current.k / current.n - base.k / base.n),
    diffInterval95: differenceInterval(base.k, base.n, current.k, current.n),
    p: round(p, 5),
    // Decided on the unrounded p.
    result: primary ? (p < threshold ? "different" : "not detected") : "exploratory",
    detectable: primary ? detectableRange(base.k, base.n, current.n, threshold) : undefined,
  };
};
const primary = Object.fromEntries(baseline.primaryRates.map((name) => [name, testRate(substitutions[name] ?? name, true)]));
const exploratory = Object.fromEntries(
  Object.keys(pooled)
    .filter((name) => !baseline.primaryRates.includes(name) && !Object.values(substitutions).includes(name))
    .map((name) => [name, testRate(name, false)]),
);
const qualityShift = Object.fromEntries(
  Object.entries(baseline.qualityMeans).map(([id, base]) => {
    const values = summaries.map((summary) => summary.quality[id]?.mean).filter((value) => value !== null && value !== undefined);
    const value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return [id, { baseline: base.mean, baselineSd: base.sd, run: round(value, 3), diff: value === null ? null : round(value - base.mean, 3) }];
  }),
);

const comparison = {
  baseline: baselineName,
  runs,
  note: `Primary rates use Fisher's exact test at ${round(threshold, 5)} each (Bonferroni over ${baseline.primaryRates.length}). "not detected" isn't "the same": see each rate's detectable range. Questions within a batch are correlated, so treat p-values near the threshold as needing more runs. Quality means are descriptive.`,
  changed,
  warnings,
  different: Object.entries(primary).filter(([, test]) => test.result === "different").map(([name]) => name),
  noData: Object.entries(primary).filter(([, test]) => test.result === "no data").map(([name]) => name),
  primary,
  exploratory,
  qualityShift,
};
writeJson(join(here, "runs", runs[0], `comparison-${baselineName}.json`), comparison);
console.log(`Changed: ${changed.join(", ") || "nothing in the setup"}`);
for (const warning of warnings) console.log(`Warning: ${warning}`);
for (const [name, test] of Object.entries(primary)) {
  const label = test.result === "different" ? "DIFFERENT   " : test.result === "no data" ? "NO DATA     " : "not detected";
  const range = test.detectable ? `  detectable below ${test.detectable.below} / above ${test.detectable.above}` : "";
  console.log(`${label} ${name.padEnd(22)} ${String(test.baseline).padEnd(6)} -> ${String(test.run).padEnd(6)} p ${test.p ?? "-"}${range}`);
}
