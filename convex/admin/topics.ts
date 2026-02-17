import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";

export const getTopics = query({
	args: {},
	returns: v.array(v.object({
		_id: v.id("topics"),
		_creationTime: v.number(),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		example: v.optional(v.string()),
		promptGuidanceForAI: v.optional(v.string()),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		takeoverStartDate: v.optional(v.number()),
		takeoverEndDate: v.optional(v.number()),
		icon: v.optional(v.string()),
	})),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		return await ctx.db
			.query("topics")
			.withIndex("by_order")
			.collect();
	},
});

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
		takeoverStartDate: v.optional(v.number()),
		takeoverEndDate: v.optional(v.number()),
		icon: v.optional(v.string()),
	},
	returns: v.id("topics"),
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
			takeoverStartDate: args.takeoverStartDate,
			takeoverEndDate: args.takeoverEndDate,
			icon: args.icon,
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
		takeoverStartDate: v.optional(v.number()),
		takeoverEndDate: v.optional(v.number()),
		icon: v.optional(v.string()),
	},
	returns: v.null(),
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

		return null;
	},
});

export const deleteTopic = mutation({
	args: {
		_id: v.id("topics"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args._id);
		return null;
	},
});
