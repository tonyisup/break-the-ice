import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember } from "../auth";

export const createCollection = mutation({
	args: {
		name: v.string(),
		organizationId: v.id("organizations"),
	},
	returns: v.id("collections"),
	handler: async (ctx, args) => {
		await ensureOrgMember(ctx, args.organizationId, ["admin", "manager"]);

		const collectionId = await ctx.db.insert("collections", {
			name: args.name,
			organizationId: args.organizationId,
		});

		return collectionId;
	},
});

export const addQuestionToCollection = mutation({
	args: {
		questionId: v.id("questions"),
		collectionId: v.id("collections"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const collection = await ctx.db.get(args.collectionId);
		if (!collection) {
			throw new Error("Collection not found");
		}
		await ensureOrgMember(ctx, collection.organizationId, ["admin", "manager"]);

		await ctx.db.insert("question_collections", {
			questionId: args.questionId,
			collectionId: args.collectionId,
		});

		return null;
	},
});

export const getCollectionsByOrganization = query({
	args: {
		organizationId: v.id("organizations"),
	},
	returns: v.array(v.object({
		_id: v.id("collections"),
		_creationTime: v.number(),
		name: v.string(),
		organizationId: v.id("organizations"),
	})),
	handler: async (ctx, args) => {
		await ensureOrgMember(ctx, args.organizationId);

		return ctx.db
			.query("collections")
			.withIndex("by_organizationId", (q) =>
				q.eq("organizationId", args.organizationId)
			)
			.collect();
	},
});
