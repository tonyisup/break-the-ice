import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const createTone = mutation({
	args: {
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		promptGuidanceForAI: v.string(),
		color: v.string(),
		icon: v.string(),
		order: v.optional(v.float64()),
	},
	returns: v.id("tones"),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		// Use index for uniqueness check instead of filter
		const existingTone = await ctx.db
			.query("tones")
			.withIndex("by_name", (q) => q.eq("name", args.name))
			.unique();
		if (existingTone) {
			throw new Error("Tone with this name already exists");
		}
		const toneId = await ctx.db.insert("tones", {
			id: args.id,
			name: args.name,
			description: args.description,
			promptGuidanceForAI: args.promptGuidanceForAI,
			color: args.color,
			icon: args.icon,
			order: args.order,
		});
		return toneId;
	},
});

export const updateTone = mutation({
	args: {
		_id: v.id("tones"),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		promptGuidanceForAI: v.string(),
		color: v.string(),
		icon: v.string(),
		order: v.optional(v.float64()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const existingTone = await ctx.db.get(args._id);
		if (!existingTone) {
			throw new Error("Tone not found");
		}

		if (args.id !== existingTone.id) {
			const toneWithId = await ctx.db
				.query("tones")
				.withIndex("by_my_id", (q) => q.eq("id", args.id))
				.unique();
			if (toneWithId) {
				throw new Error("Tone with this ID already exists");
			}
		}

		await ctx.db.patch(args._id, {
			id: args.id,
			name: args.name,
			description: args.description,
			promptGuidanceForAI: args.promptGuidanceForAI,
			color: args.color,
			icon: args.icon,
			order: args.order,
		});
		return null;
	},
});

export const deleteTone = mutation({
	args: { id: v.id("tones") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const toneToDelete = await ctx.db.get(args.id);
		if (!toneToDelete) {
			throw new Error("Tone not found");
		}

		const questionsToDelete = await ctx.db
			.query("questions")
			.withIndex("by_tone", (q) => q.eq("toneId", toneToDelete._id))
			.collect();

		await Promise.all(questionsToDelete.map((q) => ctx.db.delete(q._id)));

		await ctx.db.delete(args.id);
		return null;
	},
});
