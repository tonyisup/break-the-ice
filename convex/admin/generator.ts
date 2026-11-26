import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { ensureAdmin } from "../auth";
import { dailyCaps, FALLBACK_COST_PER_CALL_USD, spendDay } from "../lib/aiSpend";
import { convexErrorData } from "../lib/errorData";
import { GENERATION_MODEL, runPersistedQuestionGeneration } from "../lib/generationRunner";
import { estimateCostUsd, type CostRates } from "../lib/generatorCost";
import { isOpenRouterModel } from "../lib/openRouterModel";
import { isQuestionPublic } from "../lib/questionAccess";
import { latestActiveVersion } from "../lib/taxonomy";
import { findTaxonomyVersions } from "../lib/taxonomyLookup";
import { REPORT_QUESTION_LIMIT, statusOf } from "./reports";

/** The most AI calls (cells × models) one experiment may make. */
export const GENERATOR_MAX_CALLS = 100;
/** The most calls running at once, across every experiment. */
export const GENERATOR_MAX_RUNNING = 4;
export const GENERATOR_MAX_PER_CALL = 5;
export const GENERATOR_MAX_DIRECTION_CHARS = 500;
/** A call still running after this long is taken to have died with its action, and is failed so it can be retried. */
export const GENERATOR_CALL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_LABEL_CHARS = 40;
// How many recent runs the cost estimate averages.
const COST_SAMPLE = 40;

const errorText = (error: unknown) =>
  (convexErrorData(error)?.message as string | undefined) ?? (error instanceof Error ? error.message : "The call failed");

// ---------------------------------------------------------------------------------------------
// Saved models

export const listModels = query({
  args: {},
  returns: v.array(doc(schema, "generatorModels")),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const models = await ctx.db.query("generatorModels").collect();
    return models.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/** Saves a model for reuse, or renames it if it is saved already. Only the id's form is checked: a model OpenRouter doesn't have fails its calls with OpenRouter's error. */
export const saveModel = mutation({
  args: { model: v.string(), label: v.string() },
  returns: v.id("generatorModels"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const model = args.model.trim();
    const label = args.label.trim() || model;
    if (!isOpenRouterModel(model)) throw new ConvexError(`"${model}" isn't an OpenRouter model id like "anthropic/claude-sonnet-5.5".`);
    if (label.length > MAX_LABEL_CHARS) throw new ConvexError(`Keep the label under ${MAX_LABEL_CHARS} characters.`);
    const existing = await ctx.db.query("generatorModels").withIndex("by_model", (q) => q.eq("model", model)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { label });
      return existing._id;
    }
    return await ctx.db.insert("generatorModels", { model, label, createdAt: Date.now() });
  },
});

export const removeModel = mutation({
  args: { id: v.id("generatorModels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.delete(args.id);
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// Cost estimate


/**
 * What a call and a check have cost lately, from runs on GENERATION_MODEL (Opus): every
 * model is estimated at its price. A call's cost is split into a part per call (the prompt)
 * and a part per question asked for. With no history yet, each is FALLBACK_COST_PER_CALL_USD.
 */
async function costRates(ctx: QueryCtx): Promise<CostRates> {
  const priced = async (purpose: Doc<"generationRuns">["purpose"]) => {
    const runs = await ctx.db
      .query("generationRuns")
      .withIndex("by_purpose", (q) => q.eq("purpose", purpose))
      .order("desc")
      .take(COST_SAMPLE * 3);
    return runs.filter((run) => run.costUsd !== undefined && run.costUsd > 0 && run.model === GENERATION_MODEL).slice(0, COST_SAMPLE);
  };
  const generated = [...(await priced("feed")), ...(await priced("admin_experiment"))];
  const checks = await priced("quality_check");
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);
  const callAverage = average(generated.map((run) => run.costUsd!));
  const batchAverage = average(generated.map((run) => run.batchSize)) ?? 1;
  // Roughly: half a call's cost is its prompt, half its answer.
  const perCallUsd = callAverage !== undefined ? callAverage / 2 : FALLBACK_COST_PER_CALL_USD;
  const perQuestionUsd = callAverage !== undefined ? callAverage / 2 / Math.max(1, batchAverage) : FALLBACK_COST_PER_CALL_USD;
  const perCheckUsd = average(checks.map((run) => run.costUsd!)) ?? FALLBACK_COST_PER_CALL_USD;
  return { perCallUsd, perQuestionUsd, perCheckUsd };
}

async function budgetLeft(ctx: QueryCtx): Promise<{ spentUsd: number; hardCapUsd: number; leftUsd: number }> {
  const rows = await ctx.db
    .query("aiSpendDays")
    .withIndex("by_day_class", (q) => q.eq("day", spendDay(Date.now())))
    .collect();
  const spentUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const { hardCapUsd } = dailyCaps();
  return { spentUsd, hardCapUsd, leftUsd: Math.max(0, hardCapUsd - spentUsd) };
}

// ---------------------------------------------------------------------------------------------
// The page's setup

/**
 * What the grid needs before a run: how many library questions each style × tone cell holds
 * (with the chosen topic only, when there is one), the cost rates, and today's budget.
 * Coverage is keyed "style|tone" by slug.
 */
export const getSetup = query({
  args: { topicSlug: v.optional(v.string()) },
  returns: v.object({
    coverage: v.record(v.string(), v.number()),
    rates: v.object({ perCallUsd: v.number(), perQuestionUsd: v.number(), perCheckUsd: v.number() }),
    budget: v.object({ spentUsd: v.number(), hardCapUsd: v.number(), leftUsd: v.number() }),
    busyCalls: v.number(),
  }),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const coverage: Record<string, number> = {};
    const questions = await ctx.db.query("questions").take(REPORT_QUESTION_LIMIT);
    for (const question of questions) {
      if (question.duplicateOf || !isQuestionPublic(question)) continue;
      if (args.topicSlug !== undefined && (question.topic ?? question.topicSlug) !== args.topicSlug) continue;
      const style = question.style ?? question.styleSlug;
      const tone = question.tone ?? question.toneSlug;
      if (!style || !tone) continue;
      const key = `${style}|${tone}`;
      coverage[key] = (coverage[key] ?? 0) + 1;
    }
    const busy = [
      ...(await ctx.db.query("generatorCalls").withIndex("by_status_queuedAt", (q) => q.eq("status", "queued")).take(500)),
      ...(await ctx.db.query("generatorCalls").withIndex("by_status_queuedAt", (q) => q.eq("status", "running")).take(500)),
    ];
    return { coverage, rates: await costRates(ctx), budget: await budgetLeft(ctx), busyCalls: busy.length };
  },
});

// ---------------------------------------------------------------------------------------------
// Experiments

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 25 · 12 cells · 3 models · Music". The date is the spend day's (Los Angeles). */
export function experimentName(now: number, cells: number, models: number, topicName?: string): string {
  const [, month, day] = spendDay(now).split("-").map(Number);
  const parts = [`${MONTHS[month - 1]} ${day}`, cells === 1 ? "1 cell" : `${cells} cells`, models === 1 ? "1 model" : `${models} models`];
  if (topicName) parts.push(topicName);
  return parts.join(" · ");
}

async function activeSlug(ctx: QueryCtx, table: "styles" | "tones" | "topics", slug: string) {
  const entry = latestActiveVersion(await findTaxonomyVersions(ctx.db, table, slug));
  if (!entry) throw new ConvexError(`No active ${table.slice(0, -1)} "${slug}".`);
  return entry;
}

/**
 * Starts an experiment: every cell generated by every model, questionsPerCall questions a
 * call. The calls run on the server (pump), so the page can close. Each saved question waits
 * in the review queue and is checked by Claude whatever QUALITY_CHECK_MODE says.
 *
 * Refused when the estimate, at Opus prices, is more than is left of today's hard cap. Calls
 * that still meet the cap fail with the budget error and can be retried another day.
 */
export const createExperiment = mutation({
  args: {
    cells: v.array(v.object({ style: v.string(), tone: v.string() })),
    models: v.array(v.string()),
    questionsPerCall: v.number(),
    topicSlug: v.optional(v.string()),
    direction: v.optional(v.string()),
  },
  returns: v.id("generatorExperiments"),
  handler: async (ctx, args) => {
    const admin = await ensureAdmin(ctx);
    const cellKeys = new Set(args.cells.map((cell) => `${cell.style}|${cell.tone}`));
    if (args.cells.length === 0) throw new ConvexError("Pick at least one cell.");
    if (cellKeys.size !== args.cells.length) throw new ConvexError("A cell is listed twice.");
    if (args.models.length === 0) throw new ConvexError("Pick at least one model.");
    if (new Set(args.models).size !== args.models.length) throw new ConvexError("A model is listed twice.");
    const calls = args.cells.length * args.models.length;
    if (calls > GENERATOR_MAX_CALLS) {
      throw new ConvexError(`That is ${calls} calls; an experiment makes at most ${GENERATOR_MAX_CALLS}. Pick fewer cells or models.`);
    }
    const perCall = args.questionsPerCall;
    if (!Number.isInteger(perCall) || perCall < 1 || perCall > GENERATOR_MAX_PER_CALL) {
      throw new ConvexError(`Ask for 1 to ${GENERATOR_MAX_PER_CALL} questions a call.`);
    }
    const direction = args.direction?.trim() || undefined;
    if (direction && direction.length > GENERATOR_MAX_DIRECTION_CHARS) {
      throw new ConvexError(`Keep the direction under ${GENERATOR_MAX_DIRECTION_CHARS} characters.`);
    }

    const models = [];
    for (const model of args.models) {
      const saved = await ctx.db.query("generatorModels").withIndex("by_model", (q) => q.eq("model", model)).unique();
      if (!saved) throw new ConvexError(`Save "${model}" as a model first.`);
      models.push(saved);
    }
    for (const slug of new Set(args.cells.map((cell) => cell.style))) await activeSlug(ctx, "styles", slug);
    for (const slug of new Set(args.cells.map((cell) => cell.tone))) await activeSlug(ctx, "tones", slug);
    const topic = args.topicSlug ? await activeSlug(ctx, "topics", args.topicSlug) : undefined;

    const estimatedCostUsd = estimateCostUsd(await costRates(ctx), calls, perCall);
    const { leftUsd } = await budgetLeft(ctx);
    if (estimatedCostUsd > leftUsd) {
      throw new ConvexError(
        `This run is estimated at $${estimatedCostUsd.toFixed(2)}, and $${leftUsd.toFixed(2)} is left of today's AI budget. Pick fewer cells or models, or ask for fewer questions a call.`,
      );
    }

    // Blind labels in a shuffled order, so "Model A" isn't always the first chip.
    const order = models.map((model) => ({ model, sortKey: Math.random() })).sort((a, b) => a.sortKey - b.sortKey);
    const now = Date.now();
    const experimentId = await ctx.db.insert("generatorExperiments", {
      name: experimentName(now, args.cells.length, models.length, topic?.name),
      createdBy: admin.tokenIdentifier,
      createdAt: now,
      topicSlug: topic ? args.topicSlug : undefined,
      direction,
      questionsPerCall: perCall,
      cells: args.cells,
      models: order.map(({ model }, index) => ({ model: model.model, label: model.label, blindLabel: `Model ${String.fromCharCode(65 + index)}` })),
      estimatedCostUsd,
    });
    for (const cell of args.cells) {
      for (const model of args.models) {
        await ctx.db.insert("generatorCalls", {
          experimentId, style: cell.style, tone: cell.tone, model, status: "queued", attempts: 0, questionIds: [], queuedAt: now,
        });
      }
    }
    await ctx.scheduler.runAfter(0, internal.admin.generator.pump, {});
    return experimentId;
  },
});

/**
 * Starts queued calls, oldest first, until GENERATOR_MAX_RUNNING are running. A call whose
 * action died (still running after GENERATOR_CALL_TIMEOUT_MS) is failed first, so it frees its
 * place and can be retried. Run after anything that queues or finishes a call.
 */
export const pump = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const running = await ctx.db.query("generatorCalls").withIndex("by_status_queuedAt", (q) => q.eq("status", "running")).collect();
    let busy = 0;
    for (const call of running) {
      if ((call.startedAt ?? now) < now - GENERATOR_CALL_TIMEOUT_MS) {
        await ctx.db.patch(call._id, { status: "failed", error: "The call timed out.", finishedAt: now });
      } else busy++;
    }
    const free = GENERATOR_MAX_RUNNING - busy;
    if (free <= 0) return null;
    const next = await ctx.db.query("generatorCalls").withIndex("by_status_queuedAt", (q) => q.eq("status", "queued")).take(free);
    for (const call of next) {
      await ctx.db.patch(call._id, { status: "running", startedAt: now, attempts: call.attempts + 1 });
      await ctx.scheduler.runAfter(0, internal.admin.generator.runCall, { callId: call._id });
    }
    return null;
  },
});

export const callForRun = internalQuery({
  args: { callId: v.id("generatorCalls") },
  returns: v.union(
    v.null(),
    v.object({ call: doc(schema, "generatorCalls"), experiment: doc(schema, "generatorExperiments") }),
  ),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    const experiment = call && (await ctx.db.get(call.experimentId));
    return call && experiment ? { call, experiment } : null;
  },
});

export const runCall = internalAction({
  args: { callId: v.id("generatorCalls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const found = await ctx.runQuery(internal.admin.generator.callForRun, { callId: args.callId });
    if (!found || found.call.status !== "running") return null;
    const { call, experiment } = found;
    try {
      const result = await runPersistedQuestionGeneration(ctx, {
        purpose: "admin_experiment",
        requestedByUserId: experiment.createdBy,
        styleSlug: call.style,
        toneSlug: call.tone,
        topicSlug: experiment.topicSlug,
        batchSize: experiment.questionsPerCall,
        userContext: experiment.direction,
        model: call.model,
        forceQualityCheck: true,
      });
      await ctx.runMutation(internal.admin.generator.finishCall, {
        callId: args.callId,
        status: "done",
        runId: result.runId,
        questionIds: result.saveResult.insertedQuestionIds,
        duplicateCount: result.saveResult.duplicateCount,
        rejectedCount: result.saveResult.rejectedCount,
      });
    } catch (error) {
      await ctx.runMutation(internal.admin.generator.finishCall, { callId: args.callId, status: "failed", error: errorText(error).slice(0, 500) });
    }
    return null;
  },
});

export const finishCall = internalMutation({
  args: {
    callId: v.id("generatorCalls"),
    status: v.union(v.literal("done"), v.literal("failed")),
    runId: v.optional(v.id("generationRuns")),
    questionIds: v.optional(v.array(v.id("questions"))),
    duplicateCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    // A call the pump timed out has been failed already; its late result is still kept.
    if (call) {
      await ctx.db.patch(call._id, {
        status: args.status,
        runId: args.runId,
        questionIds: [...call.questionIds, ...(args.questionIds ?? [])],
        duplicateCount: args.duplicateCount,
        rejectedCount: args.rejectedCount,
        error: args.error,
        finishedAt: Date.now(),
      });
    }
    await ctx.scheduler.runAfter(0, internal.admin.generator.pump, {});
    return null;
  },
});

/** Queues a failed call again. */
export const retryCall = mutation({
  args: { callId: v.id("generatorCalls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const call = await ctx.db.get(args.callId);
    if (!call) throw new ConvexError("That call no longer exists.");
    if (call.status !== "failed") throw new ConvexError("Only a failed call can be retried.");
    await ctx.db.patch(call._id, { status: "queued", error: undefined, queuedAt: Date.now(), startedAt: undefined, finishedAt: undefined });
    await ctx.scheduler.runAfter(0, internal.admin.generator.pump, {});
    return null;
  },
});

export const updateExperiment = mutation({
  args: { id: v.id("generatorExperiments"), name: v.optional(v.string()), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const experiment = await ctx.db.get(args.id);
    if (!experiment) throw new ConvexError("That experiment no longer exists.");
    const name = args.name?.trim();
    if (args.name !== undefined && !name) throw new ConvexError("An experiment needs a name.");
    await ctx.db.patch(args.id, {
      ...(name ? { name: name.slice(0, 120) } : {}),
      ...(args.note !== undefined ? { note: args.note.trim().slice(0, 2000) || undefined } : {}),
    });
    return null;
  },
});

const callSummary = v.object({
  queued: v.number(),
  running: v.number(),
  done: v.number(),
  failed: v.number(),
  questions: v.number(),
});

function summarizeCalls(calls: Doc<"generatorCalls">[]) {
  const summary = { queued: 0, running: 0, done: 0, failed: 0, questions: 0 };
  for (const call of calls) {
    summary[call.status]++;
    summary.questions += call.questionIds.length;
  }
  return summary;
}

export const listExperiments = query({
  args: {},
  returns: v.array(v.object({ experiment: doc(schema, "generatorExperiments"), calls: callSummary })),
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    const experiments = await ctx.db.query("generatorExperiments").withIndex("by_createdAt").order("desc").take(20);
    return await Promise.all(
      experiments.map(async (experiment) => ({
        experiment,
        calls: summarizeCalls(await ctx.db.query("generatorCalls").withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id)).collect()),
      })),
    );
  },
});

const experimentQuestion = v.object({
  question: doc(schema, "questions"),
  status: v.union(v.literal("live"), v.literal("pending"), v.literal("rejected"), v.literal("retired")),
});

/** An experiment with every call and the questions each saved, where each now stands. */
export const getExperiment = query({
  args: { id: v.id("generatorExperiments") },
  returns: v.union(
    v.null(),
    v.object({
      experiment: doc(schema, "generatorExperiments"),
      calls: v.array(v.object({ call: doc(schema, "generatorCalls"), questions: v.array(experimentQuestion) })),
    }),
  ),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const experiment = await ctx.db.get(args.id);
    if (!experiment) return null;
    const calls = await ctx.db.query("generatorCalls").withIndex("by_experiment", (q) => q.eq("experimentId", args.id)).collect();
    return {
      experiment,
      calls: await Promise.all(
        calls.map(async (call) => {
          const questions = [];
          for (const id of call.questionIds) {
            const question = await ctx.db.get(id);
            if (question) questions.push({ question, status: statusOf(question) });
          }
          return { call, questions };
        }),
      ),
    };
  },
});
