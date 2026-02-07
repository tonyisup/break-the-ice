import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const manualTrigger = internalAction({
	args: {},
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		console.log("Starting manual pruning gathering...");
		const result: { targetsFound: number } = await ctx.runAction(internal.admin.pruning.gatherPruningTargets, {});
		console.log(`Pruning gathering completed: ${result.targetsFound} targets found.`);
		return result;
	},
});
