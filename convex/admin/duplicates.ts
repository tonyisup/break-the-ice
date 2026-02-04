import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";

// Mutations for progress tracking
export const createDuplicateDetectionProgress = mutation({
	args: {
		totalQuestions: v.number(),
		totalBatches: v.number(),
	},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert("duplicateDetectionProgress", {
			status: "running",
			totalQuestions: args.totalQuestions,
			processedQuestions: 0,
			duplicatesFound: 0,
			currentBatch: 0,
			totalBatches: args.totalBatches,
			errors: [],
			startedAt: now,
			lastUpdatedAt: now,
		});
	},
});

export const updateDuplicateDetectionProgress = mutation({
	args: {
		progressId: v.id("duplicateDetectionProgress"),
		processedQuestions: v.number(),
		currentBatch: v.number(),
		duplicatesFound: v.number(),
		errors: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.progressId, {
			processedQuestions: args.processedQuestions,
			currentBatch: args.currentBatch,
			duplicatesFound: args.duplicatesFound,
			errors: args.errors,
			lastUpdatedAt: Date.now(),
		});
		return null;
	},
});

export const completeDuplicateDetectionProgress = mutation({
	args: {
		progressId: v.id("duplicateDetectionProgress"),
		processedQuestions: v.number(),
		duplicatesFound: v.number(),
		errors: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.progressId, {
			status: "completed",
			processedQuestions: args.processedQuestions,
			duplicatesFound: args.duplicatesFound,
			errors: args.errors,
			completedAt: now,
			lastUpdatedAt: now,
		});

		// Cleanup old progress records
		await ctx.runMutation(api.admin.duplicates.cleanupOldProgressRecords as any, {});

		return null;
	},
});

export const failDuplicateDetectionProgress = mutation({
	args: {
		progressId: v.id("duplicateDetectionProgress"),
		errors: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.progressId, {
			status: "failed",
			errors: args.errors,
			completedAt: now,
			lastUpdatedAt: now,
		});
		return null;
	},
});

// Cleanup old progress records (keep only the latest 10)
export const cleanupOldProgressRecords = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const allProgress = await ctx.db
			.query("duplicateDetectionProgress")
			.order("desc")
			.collect();

		// Keep only the latest 10 progress records
		if (allProgress.length > 10) {
			const toDelete = allProgress.slice(10);
			for (const progress of toDelete) {
				await ctx.db.delete(progress._id);
			}
		}

		return null;
	},
});

// Query to get duplicate detection progress
export const getDuplicateDetectionProgress = query({
	args: {
		progressId: v.id("duplicateDetectionProgress"),
	},
	returns: v.union(
		v.object({
			_id: v.id("duplicateDetectionProgress"),
			status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
			totalQuestions: v.number(),
			processedQuestions: v.number(),
			duplicatesFound: v.number(),
			currentBatch: v.number(),
			totalBatches: v.number(),
			errors: v.array(v.string()),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			lastUpdatedAt: v.number(),
			_creationTime: v.number(),
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.progressId);
	},
});

// Query to get the latest duplicate detection progress
export const getLatestDuplicateDetectionProgress = query({
	args: {},
	returns: v.union(
		v.object({
			_id: v.id("duplicateDetectionProgress"),
			status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
			totalQuestions: v.number(),
			processedQuestions: v.number(),
			duplicatesFound: v.number(),
			currentBatch: v.number(),
			totalBatches: v.number(),
			errors: v.array(v.string()),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			lastUpdatedAt: v.number(),
			_creationTime: v.number(),
		}),
		v.null()
	),
	handler: async (ctx) => {
		const progress = await ctx.db
			.query("duplicateDetectionProgress")
			.order("desc")
			.first();
		return progress;
	},
});
