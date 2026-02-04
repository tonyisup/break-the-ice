import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const createStyle = mutation({
	args: {
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		structure: v.string(),
		color: v.string(),
		icon: v.string(),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const existingStyle = await ctx.db
			.query("styles")
			.filter((q) => q.eq(q.field("name"), args.name))
			.first();
		if (existingStyle) {
			throw new Error("Style with this name already exists");
		}
		const styleId = await ctx.db.insert("styles", {
			id: args.id,
			name: args.name,
			description: args.description,
			structure: args.structure,
			color: args.color,
			icon: args.icon,
			example: args.example,
			promptGuidanceForAI: args.promptGuidanceForAI,
			order: args.order,
		});
		return styleId;
	},
});

export const updateStyle = mutation({
	args: {
		_id: v.id("styles"),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		structure: v.string(),
		color: v.string(),
		icon: v.string(),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const { id, ...rest } = args;
		const existingStyle = await ctx.db.get(args._id);
		if (existingStyle) {
			await ctx.db.patch(args._id, {
				name: args.name,
				description: args.description,
				structure: args.structure,
				color: args.color,
				icon: args.icon,
				example: args.example,
				promptGuidanceForAI: args.promptGuidanceForAI,
				order: args.order,
			});
		}
	},
});

export const deleteStyle = mutation({
	args: { id: v.id("styles") },
	handler: async (ctx, args) => {
		const styleToDelete = await ctx.db.get(args.id);
		if (!styleToDelete) {
			throw new Error("Style not found");
		}

		const questionsToDelete = await ctx.db
			.query("questions")
			.withIndex("by_style", (q) => q.eq("styleId", styleToDelete._id))
			.collect();

		await Promise.all(questionsToDelete.map((q) => ctx.db.delete(q._id)));

		await ctx.db.delete(args.id);
	},
});
