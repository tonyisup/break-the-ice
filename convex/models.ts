import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureAdmin } from "./auth";

const MODELS = [
	{
		id: "openai/gpt-4o-mini",
		name: "GPT-4o Mini",
		description: "The smallest GPT-4 model, perfect for quick responses",
		nsfw: false,
	},
	{
		id: "openrouter/sonoma-dusk-alpha",
		name: "Sonoma Dusk Alpha",
		description: "A fast and intelligent general-purpose frontier model",
		nsfw: false,
	},
	{
		id: "mistralai/mistral-nemo",
		name: "Mistral Nemo",
		description: "Mistral's new best small model.Its reasoning, world knowledge, and coding accuracy are state-of-the-art",
		nsfw: true,
	},
];

export const listModels = query({
	returns: v.array(v.object({
		_id: v.id("models"),
		_creationTime: v.number(),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		nsfw: v.boolean(),
	})),
	handler: async (ctx) => {
		return await ctx.db.query("models").collect();
	}
});

export const initializeModels = mutation({
	returns: v.null(),
	handler: async (ctx) => {
		const models = await ctx.db.query("models").collect();
		if (models.length > 0) {
			return null;
		}
		for (const model of MODELS) {
			await ctx.db.insert("models", model);
		}
		return null;
	}
});

export const getModels = query({
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db.query("models").collect();
	},
});

export const createModel = mutation({
	args: {
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		nsfw: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, name, description, nsfw } = args;
		return await ctx.db.insert("models", {
			id,
			name,
			description,
			nsfw,
		});
	},
});

export const updateModel = mutation({
	args: {
		id: v.id("models"),
		name: v.string(),
		description: v.optional(v.string()),
		nsfw: v.boolean(),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, name, description, nsfw } = args;
		await ctx.db.patch(id, { name, description, nsfw });
	},
});

export const deleteModel = mutation({
	args: {
		id: v.id("models"),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args.id);
	},
});
