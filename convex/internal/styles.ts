import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

export const getStylesWithMissingEmbeddings = internalQuery({
	args: {},
	handler: async (ctx) => {
		const styles = await ctx.db.query("styles").collect();
		return styles.filter((s) => !s.embedding);
	},
});


export const getStyleBySystemId = internalQuery({
	args: { id: v.id("styles") },
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
	handler: async (ctx) => {
		return await ctx.db.query("styles").collect();
	},
});
