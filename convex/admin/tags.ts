import { v } from "convex/values";
import { mutation } from "../_generated/server";


export const createTag = mutation({
	args: {
		name: v.string(),
		grouping: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existingTag = await ctx.db
			.query("tags")
			.filter((q) => q.eq(q.field("name"), args.name))
			.first();
		if (existingTag) {
			throw new Error("Tag with this name already exists");
		}
		const tagId = await ctx.db.insert("tags", {
			name: args.name,
			grouping: args.grouping,
			description: args.description,
		});
		return tagId;
	},
});

export const updateTag = mutation({
	args: {
		id: v.id("tags"),
		name: v.string(),
		grouping: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, ...rest } = args;
		const existingTag = await ctx.db.get(args.id);
		if (existingTag) {
			await ctx.db.patch(args.id, {
				name: args.name,
				grouping: args.grouping,
				description: args.description,
			});
		}
	},
});

export const deleteTag = mutation({
	args: { id: v.id("tags") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});
