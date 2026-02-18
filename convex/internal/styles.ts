import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const styleFields = v.object({
	_id: v.id("styles"),
	_creationTime: v.number(),
	id: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	structure: v.string(),
	color: v.string(),
	icon: v.string(),
	promptGuidanceForAI: v.optional(v.string()),
	example: v.optional(v.string()),
	order: v.optional(v.number()),
	organizationId: v.optional(v.id("organizations")),
});

export const getStylesWithMissingEmbeddings = internalQuery({
	args: {},
	returns: v.array(styleFields),
	handler: async (ctx) => {
		const withEmbeddingIds = new Set(
			(await ctx.db.query("style_embeddings").collect()).map((e) => e.styleId)
		);
		const styles = await ctx.db.query("styles").collect();
		return styles.filter((s) => !withEmbeddingIds.has(s._id));
	},
});


export const getStyleBySystemId = internalQuery({
	args: { id: v.id("styles") },
	returns: v.nullable(styleFields),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getStyleById = getStyleBySystemId;

export const addStyleEmbedding = internalMutation({
	args: {
		styleId: v.id("styles"),
		embedding: v.array(v.float64()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("style_embeddings")
			.withIndex("by_styleId", (q) => q.eq("styleId", args.styleId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { embedding: args.embedding });
		} else {
			await ctx.db.insert("style_embeddings", {
				styleId: args.styleId,
				embedding: args.embedding,
			});
		}
	},
});

export const updateQuestionsWithMissingStyleIds = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").collect();
		for (const q of questions) {
			if (!q.styleId && q.style) {
				const style = await ctx.db.query("styles").withIndex("by_my_id", (s) => s.eq("id", q.style!)).first();
				if (style) {
					await ctx.db.patch(q._id, { styleId: style._id });
					await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
						questionId: q._id,
					});
				}
			}
		}
	},
});
export const getAllStylesInternal = internalQuery({
	args: {},
	returns: v.array(styleFields),
	handler: async (ctx) => {
		return await ctx.db.query("styles").collect();
	},
});
