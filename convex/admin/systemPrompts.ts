import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const getPrompts = query({
	args: {},
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db.query("systemPrompts").collect();
	},
});

export const getPromptById = query({
	args: { id: v.id("systemPrompts") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		return await ctx.db.get(args.id);
	},
});

export const getDefaultPrompt = query({
	args: {},
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db
			.query("systemPrompts")
			.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
			.first();
	},
});

export const createPrompt = mutation({
	args: {
		name: v.string(),
		content: v.string(),
		isDefault: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		if (args.isDefault) {
			const currentDefault = await ctx.db
				.query("systemPrompts")
				.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
				.unique();
			if (currentDefault) {
				await ctx.db.patch(currentDefault._id, { isDefault: false });
			}
		}
		return await ctx.db.insert("systemPrompts", args);
	},
});

export const updatePrompt = mutation({
	args: {
		id: v.id("systemPrompts"),
		name: v.string(),
		content: v.string(),
		isDefault: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, ...data } = args;
		if (data.isDefault) {
			const currentDefault = await ctx.db
				.query("systemPrompts")
				.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
				.unique();
			if (currentDefault && currentDefault._id !== id) {
				await ctx.db.patch(currentDefault._id, { isDefault: false });
			}
		}
		await ctx.db.patch(id, data);
	},
});

export const deletePrompt = mutation({
	args: { id: v.id("systemPrompts") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args.id);
	},
});
