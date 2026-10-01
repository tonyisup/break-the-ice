// Tests a run against a pooled baseline. Usage: node evals/compare.mjs <baseline-name> <run>
// Each primary rate gets a two-proportion test, Bonferroni-corrected across the primaries; other
// rates are exploratory. Writes evals/runs/<run>/comparison-<baseline-name>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPARABLE_KEYS, FAMILY_ALPHA, REPLICATE_KEYS, pick, round, twoProportionTest } from "./stats.mjs";

const [baselineName, run] = process.argv.slice(2);
if (!baselineName || !run) {
  console.error("Usage: node evals/compare.mjs <baseline-name> <run>");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(here, "runs", `${baselineName}.json`), "utf8"));
const summary = JSON.parse(readFileSync(join(here, "runs", run, "summary.json"), "utf8"));

const incomparable = COMPARABLE_KEYS.filter((key) => JSON.stringify(baseline.identity[key]) !== JSON.stringify(pick(summary, key)));
if (incomparable.length) {
  console.error(`Not comparable with ${baselineName}: ${incomparable.join(", ")} differ. Rescore or regenerate the baseline under the same judge, cutoffs and seeds.`);
  process.exit(1);
}
if (summary.batches.failed.length) {
  console.error(`${run} has failed seeds (${summary.batches.failed.join(", ")}); rerun generate.mjs before comparing.`);
  process.exit(1);
}

// What the run changed relative to the baseline's setup. Different definitions mean fit_style,
// fit_tone and fit_topic were graded against different text, so those aren't comparable.
const changed = REPLICATE_KEYS.filter((key) => !COMPARABLE_KEYS.includes(key) && JSON.stringify(baseline.identity[key]) !== JSON.stringify(pick(summary, key)));
const warnings = [
  ...(changed.includes("generator.definitionsHash") ? ["style, tone or topic definitions changed: fit scores are graded against different text"] : []),
  ...(JSON.stringify(summary.library.sizes) !== JSON.stringify([baseline.library]) ? ["the library differs from the baseline's: library duplicate rates aren't like for like"] : []),
];

const threshold = FAMILY_ALPHA / baseline.primaryRates.length;
const tests = Object.fromEntries(
  Object.entries(summary.rates).map(([name, current]) => {
    const base = baseline.rates[name];
    const { diff, p } = base ? twoProportionTest(base.k, base.n, current.k, current.n) : { diff: null, p: null };
    const primary = baseline.primaryRates.includes(name);
    return [name, { primary, baseline: base?.rate ?? null, baselineInterval95: base?.interval95 ?? null, run: current.rate, diff, p, different: primary && p !== null ? p < threshold : null }];
  }),
);
const qualityShift = Object.fromEntries(
  Object.entries(baseline.qualityMeans).map(([id, base]) => {
    const value = summary.quality[id]?.mean ?? null;
    return [id, { baseline: base.mean, baselineSd: base.sd, run: value, diff: value === null ? null : round(value - base.mean, 3) }];
  }),
);

const comparison = {
  baseline: baselineName,
  run,
  note: `Primary rates are tested at ${round(threshold, 4)} each (Bonferroni over ${baseline.primaryRates.length}). Questions in a batch are correlated, so p-values are optimistic: confirm a borderline result with a second run. Quality means are descriptive.`,
  changed,
  warnings,
  differentPrimaryRates: Object.entries(tests).filter(([, test]) => test.different).map(([name]) => name),
  rates: tests,
  qualityShift,
};
writeFileSync(join(here, "runs", run, `comparison-${baselineName}.json`), `${JSON.stringify(comparison, null, 2)}\n`);
console.log(`Changed: ${changed.join(", ") || "nothing in the setup"}`);
for (const warning of warnings) console.log(`Warning: ${warning}`);
for (const [name, test] of Object.entries(tests)) {
  const mark = test.primary ? (test.different ? "DIFFERENT" : "same     ") : "(explore)";
  console.log(`${mark} ${name.padEnd(26)} ${String(test.baseline).padEnd(6)} -> ${String(test.run).padEnd(6)} diff ${String(test.diff).padEnd(7)} p ${test.p}`);
}
