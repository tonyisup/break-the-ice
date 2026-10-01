// Generates the eval's questions on the dev deployment, one batch per seed, without saving them to
// the library. Usage: node evals/generate.mjs <run-name>
// Rerunning the same run name retries only the seeds that failed.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mapLimit } from "./jev.mjs";
import { mergeAttempts, orderedBatches, pendingSeeds, recordFailure, recordSuccess } from "./runRecord.mjs";

// Two at a time keeps a run to a few minutes without bursting the provider's rate limit.
const GENERATION_CONCURRENCY = 2;

const run = process.argv[2];
if (!run || !/^[a-z0-9-]+$/.test(run)) {
  console.error("Usage: node evals/generate.mjs <run-name>   (lowercase letters, digits and dashes)");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// `npx convex run` targets whatever these name, read from the shell and then from .env.local and
// .env as the Convex CLI does. The eval only runs on dev (the deployment also refuses unless
// EVALS_ENABLED is set there). Only these three names are read from the files; nothing is printed.
const TARGET_NAMES = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_SELF_HOSTED_URL"];
function targetSettings(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*["']?([^"'#\s]*)/))
      .filter((match) => match && TARGET_NAMES.includes(match[1]))
      .map((match) => [match[1], match[2]]),
  );
}
const target = { ...targetSettings(".env"), ...targetSettings(".env.local"), ...process.env };
if (target.CONVEX_SELF_HOSTED_URL) {
  console.error("CONVEX_SELF_HOSTED_URL is set. The eval only runs on the dev deployment.");
  process.exit(1);
}
for (const name of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT"]) {
  const value = target[name];
  if (value && !value.startsWith("dev:")) {
    console.error(`${name} points at a non-dev deployment. The eval only runs on dev.`);
    process.exit(1);
  }
}

const { batchSize, seeds } = JSON.parse(readFileSync(join(here, "seeds.json"), "utf8"));
const runDir = join(here, "runs", run);
const outPath = join(runDir, "generated.json");
mkdirSync(runDir, { recursive: true });

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : null;
const batches = new Map((previous?.batches ?? []).map((batch) => [batch.seed.id, batch]));
const todo = pendingSeeds(seeds, batches);

// The checkout this invocation ran from, marked when convex/ had local changes. `npx convex run`
// uses whatever was last pushed to dev, so push (npx convex dev --once) before generating.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = `${git("rev-parse", "--short", "HEAD")}${git("status", "--porcelain", "--", "convex") ? "+local" : ""}`;

const exec = promisify(execFile);
async function convexRun(fn, args) {
  const { stdout } = await exec("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.search(/[[{]/)));
}

// Each invocation records its commit, the library it searched, and the generation runs it made.
const invocations = previous?.invocations ?? [];
let attempts = previous?.attempts ?? [];
function save() {
  const record = { run, deployment: "dev", createdAt: previous?.createdAt ?? new Date().toISOString(), batchSize, invocations, attempts, batches: orderedBatches(seeds, batches) };
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
}

/** Fetches the generation runs made since an invocation started, and marks whether that worked. */
async function collectAttempts(invocation) {
  try {
    attempts = mergeAttempts(attempts, await convexRun("internal/evalData:evalRunAttempts", { runLabel: run, since: invocation.startedAtMs }));
    invocation.attemptsComplete = true;
  } catch (error) {
    invocation.attemptsComplete = false;
    console.log(`Couldn't read this run's generation records (${String(error.message ?? error).slice(0, 120)}). Rerun to retry.`);
  }
}

// An earlier invocation whose records couldn't be read gets another try, over its own window only.
for (const invocation of invocations.filter((inv) => inv.attemptsComplete === false)) await collectAttempts(invocation);

if (todo.length) {
  const invocation = { startedAtMs: Date.now(), commit, seeds: todo.map((seed) => seed.id), library: null, attemptsComplete: false };
  invocations.push(invocation);
  invocation.library = await convexRun("internal/evalData:evalLibraryStats", {});
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
      console.log(`${seed.id} ${seed.style}/${seed.tone}${seed.topic ? `/${seed.topic}` : ""}: ${result.candidates.length} questions`);
    } catch (error) {
      const message = (error.stderr || error.message || String(error)).trim().split("\n").slice(-3).join(" ");
      recordFailure(batches, seed, message, commit);
      console.log(`${seed.id} failed: ${message}`);
    }
    save();
  });
  await collectAttempts(invocation);
}
save();
const failed = pendingSeeds(seeds, batches).length;
const incomplete = invocations.some((inv) => inv.attemptsComplete === false);
console.log(failed ? `${failed} seeds failed; rerun to retry them.` : incomplete ? "Generation records incomplete; rerun to fetch them." : "All seeds generated.");
