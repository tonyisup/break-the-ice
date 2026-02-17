import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const publicToneFields = {
	_id: v.id("tones"),
	_creationTime: v.number(),
	id: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	promptGuidanceForAI: v.string(),
	color: v.string(),
	icon: v.string(),
	order: v.optional(v.float64()),
};

export const getTonesWithMissingEmbeddings = internalQuery({
	args: {},
	returns: v.array(v.object(publicToneFields)),
	handler: async (ctx) => {
		const withEmbeddingIds = new Set(
			(await ctx.db.query("tone_embeddings").collect()).map((e) => e.toneId)
		);
		const tones = await ctx.db.query("tones").collect();
		return tones.filter((t) => !withEmbeddingIds.has(t._id));
	},
});

export const addToneEmbedding = internalMutation({
	args: {
		toneId: v.id("tones"),
		embedding: v.array(v.float64()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("tone_embeddings")
			.withIndex("by_toneId", (q) => q.eq("toneId", args.toneId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { embedding: args.embedding });
		} else {
			await ctx.db.insert("tone_embeddings", {
				toneId: args.toneId,
				embedding: args.embedding,
			});
		}
	},
});

export const updateQuestionsWithMissingToneIds = internalMutation({
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").collect();
		for (const q of questions) {
			if (!q.toneId) {
				const tone = await ctx.db.query("tones").filter((t) => t.eq(t.field("id"), q.tone)).first();
				if (tone) {
					await ctx.db.patch(q._id, { toneId: tone._id });
					await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
						questionId: q._id,
					});
				}
			}
		}
	},
});

export const getToneById = internalQuery({
	args: { id: v.id("tones") },
	returns: v.nullable(v.object({
		_id: v.id("tones"),
		_creationTime: v.number(),
		id: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		color: v.string(),
		icon: v.string(),
		promptGuidanceForAI: v.string(),
		order: v.optional(v.number()),
		organizationId: v.optional(v.id("organizations")),
	})),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});
export const getAllTonesInternal = internalQuery({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		return await ctx.db.query("tones").collect();
	},
});
