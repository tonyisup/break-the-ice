import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

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
		const tones = await ctx.db.query("tones").filter((q) => q.eq(q.field("embedding"), undefined)).collect();
		return tones.map(({ embedding, ...rest }) => rest);
	},
});

export const addToneEmbedding = internalMutation({
	args: {
		toneId: v.id("tones"),
		embedding: v.array(v.float64()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.toneId, {
			embedding: args.embedding,
		});
		return null;
	},
});

export const updateQuestionsWithMissingToneIds = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").collect();
		await Promise.all(questions.map(async (q) => {
			if (!q.toneId && q.tone) {
				const tone = await ctx.db.query("tones").withIndex("by_my_id", (t) => t.eq("id", q.tone)).first();
				if (tone) {
					await ctx.db.patch(q._id, { toneId: tone._id });
				}
			}
		}));
		return null;
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
		embedding: v.optional(v.array(v.number())),
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
