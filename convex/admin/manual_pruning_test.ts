import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { gatherPruningTargetsImpl } from "./pruning";

export const manualTrigger = internalAction({
	args: {},
	returns: v.object({ targetsFound: v.number() }),
	handler: async (ctx): Promise<{ targetsFound: number }> => {
		console.log("Starting manual pruning gathering...");
		const result = await gatherPruningTargetsImpl(ctx);
		console.log(`Pruning gathering completed: ${result.targetsFound} targets found.`);
		return result;
	},
});
