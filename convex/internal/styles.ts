import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

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
	embedding: v.optional(v.array(v.number())),
	organizationId: v.optional(v.id("organizations")),
});

export const getStylesWithMissingEmbeddings = internalQuery({
	args: {},
	returns: v.array(styleFields),
	handler: async (ctx) => {
		const styles = await ctx.db.query("styles").collect();
		return styles.filter((s) => !s.embedding);
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
	handler: async (ctx, args) => {
		await ctx.db.patch(args.styleId, {
			embedding: args.embedding,
		});
	},
});

export const updateQuestionsWithMissingStyleIds = internalMutation({
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").collect();
		await Promise.all(questions.map(async (q) => {
			if (!q.styleId) {
				const style = await ctx.db.query("styles").filter((s) => s.eq(s.field("id"), q.style)).first();
				if (style) {
					await ctx.db.patch(q._id, { styleId: style._id });
				}
			}
		}));
	},
});
export const getAllStylesInternal = internalQuery({
	args: {},
	returns: v.array(styleFields),
	handler: async (ctx) => {
		return await ctx.db.query("styles").collect();
	},
});
