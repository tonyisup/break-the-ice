import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const createTag = mutation({
	args: {
		name: v.string(),
		grouping: v.string(),
		description: v.optional(v.string()),
	},
	returns: v.id("tags"),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		// Note: tags table doesn't have a by_name index, so we fetch all and filter in JS
		const allTags = await ctx.db.query("tags").collect();
		const existingTag = allTags.find(t => t.name === args.name);
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
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const existingTag = await ctx.db.get(args.id);
		if (!existingTag) {
			throw new Error("Tag not found");
		}
		await ctx.db.patch(args.id, {
			name: args.name,
			grouping: args.grouping,
			description: args.description,
		});
		return null;
	},
});

export const deleteTag = mutation({
	args: { id: v.id("tags") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const existingTag = await ctx.db.get(args.id);
		if (!existingTag) {
			throw new Error("Tag not found");
		}
		await ctx.db.delete(args.id);
		return null;
	},
});
