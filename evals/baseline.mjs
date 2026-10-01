// Pools replicate runs of the same setup into one baseline: each rate's counts added up, with a 95%
// interval, and each quality mean's run-to-run spread. Usage:
//   node evals/baseline.mjs <baseline-name> <run> <run> [<run>...]
// Writes evals/runs/<baseline-name>.json. Compare a later run with evals/compare.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIMARY_RATES, REPLICATE_KEYS, identityMismatches, mean, pick, poolRates, round, sd } from "./stats.mjs";

const [name, ...runs] = process.argv.slice(2);
if (!name || runs.length < 2) {
  console.error("Usage: node evals/baseline.mjs <baseline-name> <run> <run> [<run>...]");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const summaries = runs.map((run) => JSON.parse(readFileSync(join(here, "runs", run, "summary.json"), "utf8")));

// Replicates must share the whole setup, generate every seed, and search the same library.
const problems = [
  ...identityMismatches(summaries, REPLICATE_KEYS).map((key) => `${key} differs`),
  ...summaries.filter((summary) => summary.batches.failed.length).map((summary) => `${summary.run} has failed seeds`),
  ...(new Set(summaries.map((summary) => JSON.stringify(summary.library.sizes))).size > 1 ? ["library sizes differ"] : []),
  ...summaries.filter((summary) => summary.library.sizes.length !== 1).map((summary) => `${summary.run} spans library changes`),
];
if (problems.length) {
  console.error(`These runs aren't replicates of one setup: ${problems.join("; ")}.`);
  process.exit(1);
}

const qualityMeans = Object.fromEntries(
  Object.keys(summaries[0].quality).map((id) => {
    const values = summaries.map((summary) => summary.quality[id].mean).filter((value) => value !== null);
    return [id, { perRun: values, mean: round(mean(values), 3), sd: round(sd(values), 3) }];
  }),
);

const baseline = {
  name,
  runs,
  note: "Rates pool every run's counts; interval95 is a Wilson interval. compare.mjs tests a later run against these counts.",
  identity: Object.fromEntries(REPLICATE_KEYS.map((key) => [key, pick(summaries[0], key)])),
  library: summaries[0].library.sizes[0],
  generator: {
    commits: [...new Set(summaries.flatMap((summary) => summary.generator.commits))],
    resolvedModels: summaries.map((summary) => summary.generator.resolvedModels),
    costUsd: round(summaries.reduce((sum, summary) => sum + summary.generator.costUsd, 0), 4),
  },
  primaryRates: PRIMARY_RATES,
  rates: poolRates(summaries.map((summary) => summary.rates)),
  qualityMeans,
};
writeFileSync(join(here, "runs", `${name}.json`), `${JSON.stringify(baseline, null, 2)}\n`);
for (const [rateName, pooled] of Object.entries(baseline.rates)) {
  const flag = PRIMARY_RATES.includes(rateName) ? "*" : " ";
  console.log(`${flag} ${rateName.padEnd(26)} ${String(pooled.rate).padEnd(6)} [${pooled.interval95?.join(", ")}]  ${pooled.k}/${pooled.n}  runs ${pooled.perRun.join(" / ")}`);
}
