// Generates the eval's questions on the dev deployment, one batch per seed, without saving them to
// the library. Usage: node evals/generate.mjs <run-name> [--allow-local]
// Rerunning the same run name retries only the seeds that failed. Commit convex/ and push it to dev
// (npx convex dev --once) first: --allow-local runs with uncommitted convex/ changes, for trying
// things out, and marks the run "+local".
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse } from "dotenv";
import { mapLimit } from "./async.mjs";
import { cliError, mergeAttempts, orderedBatches, pendingSeeds, recordFailure, recordSuccess, writeJson } from "./runRecord.mjs";

// Two at a time keeps a run to a few minutes without bursting the provider's rate limit.
const GENERATION_CONCURRENCY = 2;
// The laptop's clock and the deployment's can differ; generation records are read with this much
// slack on each side (the run label keeps other runs out).
const CLOCK_SLACK_MS = 60_000;

const [run, ...flags] = process.argv.slice(2);
if (!run || !/^[a-z0-9-]+$/.test(run)) {
  console.error("Usage: node evals/generate.mjs <run-name>   (lowercase letters, digits and dashes)");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// `npx convex run` targets whatever these name, from the shell or else from .env.local and .env,
// parsed with the same dotenv the Convex CLI uses. The eval only runs where they clearly name a dev
// deployment (and the deployment also refuses unless EVALS_ENABLED is set there). Only these names
// are read from the files; nothing is printed.
const TARGET_NAMES = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_SELF_HOSTED_URL"];
function targetSettings(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  const parsed = parse(readFileSync(path, "utf8"));
  return Object.fromEntries(TARGET_NAMES.filter((name) => parsed[name]).map((name) => [name, parsed[name]]));
}
const fromShell = Object.fromEntries(TARGET_NAMES.filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
const target = { ...targetSettings(".env"), ...targetSettings(".env.local"), ...fromShell };
if (target.CONVEX_SELF_HOSTED_URL) {
  console.error("CONVEX_SELF_HOSTED_URL is set. The eval only runs on the dev deployment.");
  process.exit(1);
}
for (const name of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT"]) {
  if (target[name] && !target[name].startsWith("dev:")) {
    console.error(`${name} points at a non-dev deployment. The eval only runs on dev.`);
    process.exit(1);
  }
}
if (!target.CONVEX_DEPLOY_KEY && !target.CONVEX_DEPLOYMENT) {
  console.error("No Convex deployment is configured (CONVEX_DEPLOYMENT in .env.local). The eval only runs on dev.");
  process.exit(1);
}

const { batchSize, seeds } = JSON.parse(readFileSync(join(here, "seeds.json"), "utf8"));
const runDir = join(here, "runs", run);
const outPath = join(runDir, "generated.json");
mkdirSync(runDir, { recursive: true });

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
const batches = new Map((previous?.batches ?? []).map((batch) => [batch.seed.id, batch]));
const todo = pendingSeeds(seeds, batches);

// The checkout this invocation ran from. `npx convex run` uses whatever was last pushed to dev; the
// settings each batch returns show what actually ran.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const dirty = Boolean(git("status", "--porcelain", "--", "convex"));
if (dirty && !flags.includes("--allow-local")) {
  console.error("convex/ has uncommitted changes, so the run's commit wouldn't say what code ran. Commit and push them, or pass --allow-local.");
  process.exit(1);
}
const commit = `${git("rev-parse", "--short", "HEAD")}${dirty ? "+local" : ""}`;
const earlierCommits = [...new Set((previous?.invocations ?? []).map((inv) => inv.commit))];
if (todo.length && earlierCommits.some((earlier) => earlier !== commit)) {
  console.error(`Run "${run}" was generated at ${earlierCommits.join(", ")} and the checkout is at ${commit}. Resuming would mix code versions; start a new run name.`);
  process.exit(1);
}

const exec = promisify(execFile);
async function convexRun(fn, args) {
  const { stdout } = await exec("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.search(/[[{]/)));
}

// Each invocation records its commit, the library it searched, and the generation runs it made.
const invocations = previous?.invocations ?? [];
let attempts = previous?.attempts ?? [];
function save() {
  writeJson(outPath, { run, deployment: "dev", createdAt: previous?.createdAt ?? new Date().toISOString(), batchSize, invocations, attempts, batches: orderedBatches(seeds, batches) });
}

/**
 * Reads the generation runs an invocation made, and marks it complete only when every one has
 * finished and every batch it generated is among them. Otherwise a later rerun reads it again.
 */
async function collectAttempts(invocation) {
  try {
    const fresh = await convexRun("internal/evalData:evalRunAttempts", {
      runLabel: run,
      since: invocation.startedAtMs - CLOCK_SLACK_MS,
      ...(invocation.endedAtMs ? { until: invocation.endedAtMs + CLOCK_SLACK_MS } : {}),
    });
    attempts = mergeAttempts(attempts, fresh);
    const settled = fresh.every((attempt) => attempt.status === "succeeded" || attempt.status === "failed");
    const ok = (invocation.generated ?? []).map((id) => batches.get(id));
    const found = new Set(fresh.map((attempt) => attempt.runId));
    invocation.attemptsComplete = settled && ok.every((batch) => found.has(batch.result.runId));
    if (!invocation.attemptsComplete) console.log("Some generation runs hadn't finished when read. Rerun in a minute to refresh them.");
  } catch (error) {
    invocation.attemptsComplete = false;
    console.log(`Couldn't read this run's generation records (${cliError(error)}). Rerun to retry.`);
  }
}

// An earlier invocation whose records were unreadable or unfinished gets read again, over its window.
for (const invocation of invocations.filter((inv) => inv.attemptsComplete !== true)) await collectAttempts(invocation);

if (todo.length) {
  const invocation = { startedAtMs: Date.now(), commit, seeds: todo.map((seed) => seed.id), generated: [], library: null, attemptsComplete: false };
  invocations.push(invocation);
  // Saved before any model call, so an interrupted run still knows when its calls started.
  save();
  invocation.library = await convexRun("internal/evals:evalLibraryStats", {});
  console.log(`${todo.length} of ${seeds.length} seeds to generate for run "${run}" at ${commit}.`);
  await mapLimit(todo, GENERATION_CONCURRENCY, async (seed) => {
    const args = {
      runLabel: run,
      seedId: seed.id,
      styleSlug: seed.style,
      toneSlug: seed.tone,
      batchSize,
      ...(seed.topic ? { topicSlug: seed.topic } : {}),
    };
    try {
      const result = await convexRun("internal/evals:generateEvalBatch", args);
      recordSuccess(batches, seed, result, commit);
      invocation.generated.push(seed.id);
      console.log(`${seed.id} ${seed.style}/${seed.tone}${seed.topic ? `/${seed.topic}` : ""}: ${result.candidates.length} questions`);
    } catch (error) {
      const message = cliError(error);
      recordFailure(batches, seed, message, commit);
      console.log(`${seed.id} failed: ${message}`);
    }
    save();
  });
  invocation.endedAtMs = Date.now();
  await collectAttempts(invocation);
}
save();
const failed = pendingSeeds(seeds, batches).length;
const incomplete = invocations.some((inv) => inv.attemptsComplete !== true);
console.log(failed ? `${failed} seeds failed; rerun to retry them.` : incomplete ? "Generation records incomplete; rerun to fetch them." : "All seeds generated.");
