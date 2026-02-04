"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

export const startDuplicateDetection = action({
	args: {
		threshold: v.optional(v.number()),
	},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx, args): Promise<Id<"duplicateDetectionProgress">> => {
		await ensureAdmin(ctx);
		return await ctx.runAction(internal.internal.ai.detectDuplicateQuestionsStreaming, {
			threshold: args.threshold,
		}) as Id<"duplicateDetectionProgress">;
	},
});
