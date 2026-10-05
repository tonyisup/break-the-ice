// Generates the eval's questions on the dev deployment, one batch per seed, without saving them to
// the library. Usage: node evals/generate.mjs <run-name> [--model <openrouter-model>] [--allow-local]
// Rerunning the same run name retries only the seeds that failed. Commit convex/ and push it to dev
// (npx convex dev --once) first: --allow-local runs with uncommitted convex/ changes, for trying
// things out, and marks the run "+local". --model generates with that OpenRouter model (like
// anthropic/claude-sonnet-5.5) instead of the app's default. A run keeps one model: a rerun without
// --model uses the run's own.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const USAGE = "Usage: node evals/generate.mjs <run-name> [--model <openrouter-model>] [--allow-local]   (run names: lowercase letters, digits and dashes, not starting with a dash)";
const [run, ...flags] = process.argv.slice(2);
// Anything else after the run name is refused, so a misplaced or misspelled flag can't quietly
// start a paid run with the default model.
let model; // undefined until given; null means the deployment's default model
let allowLocal = false;
let badArgs = !run || !/^[a-z0-9][a-z0-9-]*$/.test(run);
for (let i = 0; i < flags.length && !badArgs; i += 1) {
  if (flags[i] === "--allow-local") allowLocal = true;
  else if (flags[i] === "--model" && model === undefined && flags[i + 1] && !flags[i + 1].startsWith("-")) model = flags[++i];
  else badArgs = true;
}
if (badArgs) {
  console.error(USAGE);
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

// One process per run name at a time: two would overwrite each other's record, and their model
// calls are counted under the same run label.
const lockPath = join(runDir, ".lock");
try {
  writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });
} catch {
  console.error(`Run "${run}" is already being generated (${lockPath} exists). If no generate.mjs is running, delete that file.`);
  process.exit(1);
}
process.on("exit", () => rmSync(lockPath, { force: true }));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(1));

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
// Runs from before --model existed have no model recorded, and used the default. A run that never
// reached a model (every seed refused as "setup", such as a --model the deployment's name check
// rejects) can still switch. A well-formed name the provider doesn't know does reach it, and
// leaves failed generation runs behind, so that run needs a new name. An invocation whose model
// calls weren't all read back may have reached one too.
const previousModel = previous?.model ?? null;
const reachedModel = Boolean(previous) && (
  (previous.attempts ?? []).length > 0 ||
  (previous.invocations ?? []).some((invocation) => invocation.attemptsComplete !== true) ||
  (previous.batches ?? []).some((batch) => batch.ok || batch.failures.some((failure) => failure.stage !== "setup"))
);
if (model === undefined) model = previousModel;
if (reachedModel && model !== previousModel) {
  const named = (value) => (value ? `--model ${value}` : "the default model");
  console.error(`Run "${run}" was generated with ${named(previousModel)}, not ${named(model)}. A run keeps one model; rerun without --model, or start a new run name.`);
  process.exit(1);
}
const batches = new Map((previous?.batches ?? []).map((batch) => [batch.seed.id, batch]));
const todo = pendingSeeds(seeds, batches);

// The checkout this invocation ran from. `npx convex run` uses whatever was last pushed to dev; the
// settings each batch returns show what actually ran.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const dirty = Boolean(git("status", "--porcelain", "--", "convex"));
if (dirty && !allowLocal) {
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
const createdAt = previous?.createdAt ?? new Date().toISOString();
function save() {
  writeJson(outPath, { run, deployment: "dev", createdAt, model, batchSize, invocations, attempts, batches: orderedBatches(seeds, batches) });
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
  // Read before the invocation is recorded: if this first call fails (evals off on dev, the CLI
  // not signed in), no model was called, so nothing about this invocation is saved.
  const library = await convexRun("internal/evals:evalLibraryStats", {}).catch((error) => {
    console.error(`Couldn't read the library from dev (${cliError(error)}). Nothing was generated.`);
    process.exit(1);
  });
  const invocation = { startedAtMs: Date.now(), commit, seeds: todo.map((seed) => seed.id), generated: [], library, attemptsComplete: false };
  invocations.push(invocation);
  // Saved before any model call, so an interrupted run still knows when its calls started.
  save();
  console.log(`${todo.length} of ${seeds.length} seeds to generate for run "${run}" at ${commit} with ${model ?? "the default model"}.`);
  await mapLimit(todo, GENERATION_CONCURRENCY, async (seed) => {
    const args = {
      runLabel: run,
      seedId: seed.id,
      styleSlug: seed.style,
      toneSlug: seed.tone,
      batchSize,
      ...(seed.topic ? { topicSlug: seed.topic } : {}),
      ...(model ? { model } : {}),
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
const pending = pendingSeeds(seeds, batches);
const failed = pending.length;
// A seed refused before any model call (a model name the deployment rejects, a missing style)
// would be refused the same way on a plain rerun.
const refused = failed > 0 && pending.every((seed) => batches.get(seed.id)?.failures.at(-1)?.stage === "setup");
const incomplete = invocations.some((inv) => inv.attemptsComplete !== true);
console.log(
  refused
    ? `${failed} seeds were refused before generating; fix the setup (pass the right --model if the name was refused), then rerun.`
    : failed
      ? `${failed} seeds failed; rerun to retry them.`
      : incomplete
        ? "Generation records incomplete; rerun to fetch them."
        : "All seeds generated.",
);
