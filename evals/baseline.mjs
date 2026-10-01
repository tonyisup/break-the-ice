// Pools replicate runs of the same setup into one baseline: each rate's counts added up, with a 95%
// interval, and each quality mean's run-to-run spread. Usage:
//   node evals/baseline.mjs <baseline-name> <run> <run> [<run>...]
// Writes evals/runs/<baseline-name>.json (--force to replace an existing one). Compare later runs
// with evals/compare.mjs.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJson } from "./runRecord.mjs";
import { PRIMARY_RATES, REPLICATE_KEYS, identityMismatches, mean, pick, poolRates, round, sd } from "./stats.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const [name, ...runs] = args.filter((arg) => arg !== "--force");
if (!name || runs.length < 2) {
  console.error("Usage: node evals/baseline.mjs <baseline-name> <run> <run> [<run>...] [--force]");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "runs", `${name}.json`);
if (existsSync(outPath) && !force) {
  console.error(`runs/${name}.json already exists. Pass --force to replace it.`);
  process.exit(1);
}
const summaries = runs.map((run) => JSON.parse(readFileSync(join(here, "runs", run, "summary.json"), "utf8")));

// Replicates must share the whole setup, generate every seed, and search the same library.
const problems = [
  // The same observations counted twice would narrow every interval for nothing.
  ...(new Set(summaries.map((summary) => summary.generator.runIdsHash)).size < summaries.length ? ["a run is listed twice"] : []),
  ...summaries.filter((summary) => summary.generator.commits.length !== 1).map((summary) => `${summary.run} mixes code versions`),
  ...identityMismatches(summaries, REPLICATE_KEYS).map((key) => `${key} differs`),
  ...summaries.filter((summary) => summary.batches.failed.length).map((summary) => `${summary.run} has failed seeds`),
  ...(new Set(summaries.map((summary) => JSON.stringify(summary.library.sizes))).size > 1 ? ["library sizes differ"] : []),
  ...summaries.filter((summary) => summary.library.sizes.length !== 1).map((summary) => `${summary.run} spans library changes`),
  ...summaries.filter((summary) => summary.generator.resolvedModelSet.length !== 1).map((summary) => `${summary.run} mixes models`),
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
  note: "Rates pool every run's counts; interval95 is a Wilson interval. compare.mjs tests later runs against these counts.",
  identity: Object.fromEntries(REPLICATE_KEYS.map((key) => [key, pick(summaries[0], key)])),
  library: summaries[0].library.sizes[0],
  runIdsHashes: summaries.map((summary) => summary.generator.runIdsHash),
  generator: {
    commits: [...new Set(summaries.flatMap((summary) => summary.generator.commits))],
    resolvedModels: summaries.map((summary) => summary.generator.resolvedModels),
    costUsd: round(summaries.reduce((sum, summary) => sum + summary.generator.costUsd, 0), 4),
  },
  primaryRates: PRIMARY_RATES,
  rates: poolRates(summaries.map((summary) => summary.rates)),
  qualityMeans,
};
writeJson(outPath, baseline);
for (const [rateName, pooled] of Object.entries(baseline.rates)) {
  const flag = PRIMARY_RATES.includes(rateName) ? "*" : " ";
  console.log(`${flag} ${rateName.padEnd(26)} ${String(pooled.rate).padEnd(6)} [${pooled.interval95?.join(", ")}]  ${pooled.k}/${pooled.n}  runs ${pooled.perRun.join(" / ")}`);
}
