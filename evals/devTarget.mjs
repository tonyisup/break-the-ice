import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { parse } from "dotenv";

// `npx convex run` targets whatever these name, from the shell or else from .env.local and .env,
// parsed with the same dotenv the Convex CLI uses. The eval only runs where they clearly name a dev
// deployment (and the deployment also refuses unless EVALS_ENABLED is set there). Only these names
// are read from the files; nothing is printed.
const TARGET_NAMES = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_SELF_HOSTED_URL"];

/** Exits unless the Convex CLI, run from `root`, would target a dev deployment. */
export function assertDevTarget(root) {
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
}

const exec = promisify(execFile);

/** Runs a Convex function on the deployment the CLI targets from `root`, and returns what it returned. */
export async function convexRun(root, fn, args) {
  const { stdout } = await exec("npx", ["convex", "run", fn, JSON.stringify(args)], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.search(/[[{]/)));
}
