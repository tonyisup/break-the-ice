import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";

export const getModels = query({
	args: {},
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db.query("aiModels").collect();
	},
});

export const getModelById = query({
	args: { id: v.id("aiModels") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		return await ctx.db.get(args.id);
	},
});

export const getDefaultModel = query({
	args: {},
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db
			.query("aiModels")
			.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
			.first();
	},
});

export const createModel = mutation({
	args: {
		name: v.string(),
		identifier: v.string(),
		provider: v.string(),
		isDefault: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		if (args.isDefault) {
			const currentDefault = await ctx.db
				.query("aiModels")
				.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
				.unique();
			if (currentDefault) {
				await ctx.db.patch(currentDefault._id, { isDefault: false });
			}
		}
		return await ctx.db.insert("aiModels", args);
	},
});

export const updateModel = mutation({
	args: {
		id: v.id("aiModels"),
		name: v.string(),
		identifier: v.string(),
		provider: v.string(),
		isDefault: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, ...data } = args;
		if (data.isDefault) {
			const currentDefault = await ctx.db
				.query("aiModels")
				.withIndex("by_isDefault", (q) => q.eq("isDefault", true))
				.unique();
			if (currentDefault && currentDefault._id !== id) {
				await ctx.db.patch(currentDefault._id, { isDefault: false });
			}
		}
		await ctx.db.patch(id, data);
	},
});

export const deleteModel = mutation({
	args: { id: v.id("aiModels") },
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args.id);
	},
});
