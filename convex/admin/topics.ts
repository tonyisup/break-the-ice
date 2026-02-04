import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";

export const createTopic = mutation({
	args: {
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		// Check for existing topic with same ID
		const existing = await ctx.db
			.query("topics")
			.withIndex("by_my_id", (q) => q.eq("id", args.id))
			.unique();

		if (existing) {
			throw new Error(`Topic with id ${args.id} already exists`);
		}

		const topicId = await ctx.db.insert("topics", {
			id: args.id,
			name: args.name,
			description: args.description,
			example: args.example,
			promptGuidanceForAI: args.promptGuidanceForAI,
			order: args.order,
			organizationId: args.organizationId,
			startDate: args.startDate,
			endDate: args.endDate,
		});

		// Trigger embedding generation
		await ctx.scheduler.runAfter(0, internal.lib.retriever.embedTopic, {
			topicId: topicId,
		});

		return topicId;
	},
});

export const updateTopic = mutation({
	args: {
		_id: v.id("topics"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const { _id, ...updates } = args;

		await ctx.db.patch(_id, updates);

		// Trigger embedding re-generation if relevant fields changed
		if (updates.name || updates.description || updates.promptGuidanceForAI) {
			await ctx.scheduler.runAfter(0, internal.lib.retriever.embedTopic, {
				topicId: _id,
			});
		}
	},
});

export const deleteTopic = mutation({
	args: {
		_id: v.id("topics"),
	},
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args._id);
	},
});
