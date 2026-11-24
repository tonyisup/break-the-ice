import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { generationProgressStage } from "../lib/generationProgress";

/** A finished request's progress is only useful while its page is waiting. */
export const GENERATION_PROGRESS_KEEP_MS = 60 * 60 * 1000;
const CLEAR_BATCH_SIZE = 200;

export const startProgress = internalMutation({
  args: { userId: v.id("users"), requestKey: v.string() },
  returns: v.id("generationProgress"),
  handler: async (ctx, args) => {
    const updatedAt = Date.now();
    const existing = await ctx.db
      .query("generationProgress")
      .withIndex("by_userId_requestKey", (q) => q.eq("userId", args.userId).eq("requestKey", args.requestKey))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { stage: "preparing", updatedAt });
      return existing._id;
    }
    return await ctx.db.insert("generationProgress", { ...args, stage: "preparing", updatedAt });
  },
});

export const setStage = internalMutation({
  args: { progressId: v.id("generationProgress"), stage: generationProgressStage },
  returns: v.null(),
  handler: async (ctx, args) => {
    const progress = await ctx.db.get(args.progressId);
    if (!progress || progress.stage === "done" || progress.stage === "failed") return null;
    await ctx.db.patch(args.progressId, { stage: args.stage, updatedAt: Date.now() });
    return null;
  },
});

export const clearOldProgress = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - GENERATION_PROGRESS_KEEP_MS;
    const rows = await ctx.db
      .query("generationProgress")
      .withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoff))
      .take(CLEAR_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === CLEAR_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.internal.generationProgress.clearOldProgress, {});
    }
    return rows.length;
  },
});
