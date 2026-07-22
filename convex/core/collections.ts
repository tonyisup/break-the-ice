import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ensurePaidOrganizationMember } from "../auth";

const MIN_PUBLIC_SEARCH_LENGTH = 3;
const MAX_PUBLIC_SEARCH_SCAN = 1500;
const MAX_PUBLIC_SEARCH_RESULTS = 25;

const publicQuestionSummary = v.object({
	_id: v.id("questions"),
	text: v.string(),
	style: v.optional(v.string()),
	tone: v.optional(v.string()),
	topic: v.optional(v.string()),
});

function isPubliclyAvailableStatus(status: Doc<"questions">["status"]) {
	return status === "public" || status === "approved" || status === undefined;
}

async function loadPublicQuestionPool(ctx: QueryCtx, scanLimit: number) {
	const perStatus = Math.ceil(scanLimit / 3);
	const [publicRows, approvedRows, legacyRows] = await Promise.all([
		ctx.db
			.query("questions")
			.withIndex("by_status", (q) => q.eq("status", "public"))
			.take(perStatus),
		ctx.db
			.query("questions")
			.withIndex("by_status", (q) => q.eq("status", "approved"))
			.take(perStatus),
		ctx.db
			.query("questions")
			.withIndex("by_status", (q) => q.eq("status", undefined))
			.take(perStatus),
	]);

	const byId = new Map<Id<"questions">, Doc<"questions">>();
	for (const row of [...publicRows, ...approvedRows, ...legacyRows]) {
		if (isPubliclyAvailableStatus(row.status)) {
			byId.set(row._id, row);
		}
	}
	return [...byId.values()];
}

function toPublicQuestionSummary(question: Doc<"questions">) {
	return {
		_id: question._id,
		text: question.text ?? question.customText ?? "",
		style: question.style,
		tone: question.tone,
		topic: question.topic,
	};
}

export const createCollection = mutation({
	args: {
		name: v.string(),
		organizationId: v.id("organizations"),
	},
	returns: v.id("collections"),
	handler: async (ctx, args) => {
		await ensurePaidOrganizationMember(ctx, args.organizationId, ["admin", "manager"]);

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
		await ensurePaidOrganizationMember(ctx, collection.organizationId, ["admin", "manager"]);

		const question = await ctx.db.get(args.questionId);
		if (!question || !isPubliclyAvailableStatus(question.status)) {
			throw new Error("Only public questions can be added to collections");
		}

		const linksInCollection = await ctx.db
			.query("question_collections")
			.withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
			.take(500);
		if (linksInCollection.some((link) => link.questionId === args.questionId)) {
			throw new Error("Question is already in this collection");
		}

		await ctx.db.insert("question_collections", {
			questionId: args.questionId,
			collectionId: args.collectionId,
		});

		return null;
	},
});

export const removeQuestionFromCollection = mutation({
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
		await ensurePaidOrganizationMember(ctx, collection.organizationId, ["admin", "manager"]);

		const linksInCollection = await ctx.db
			.query("question_collections")
			.withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
			.take(500);
		const link = linksInCollection.find((row) => row.questionId === args.questionId);
		if (link) {
			await ctx.db.delete(link._id);
		}

		return null;
	},
});

export const getCollectionMembershipForQuestion = query({
	args: {
		questionId: v.id("questions"),
		organizationId: v.id("organizations"),
	},
	returns: v.array(v.id("collections")),
	handler: async (ctx, args) => {
		await ensurePaidOrganizationMember(ctx, args.organizationId);

		const links = await ctx.db
			.query("question_collections")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.take(100);

		const collectionIds: Id<"collections">[] = [];
		for (const link of links) {
			const collection = await ctx.db.get(link.collectionId);
			if (collection?.organizationId === args.organizationId) {
				collectionIds.push(link.collectionId);
			}
		}

		return collectionIds;
	},
});

export const getCollectionsByOrganization = query({
	args: {
		organizationId: v.id("organizations"),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.object({
		_id: v.id("collections"),
		_creationTime: v.number(),
		name: v.string(),
		organizationId: v.id("organizations"),
		questionCount: v.number(),
	})),
	handler: async (ctx, args) => {
		await ensurePaidOrganizationMember(ctx, args.organizationId);
		const limit = Math.min(args.limit ?? 100, 250);

		const collections = await ctx.db
			.query("collections")
			.withIndex("by_organizationId", (q) =>
				q.eq("organizationId", args.organizationId)
			)
			.take(limit);

		return Promise.all(
			collections.map(async (collection) => {
				const links = await ctx.db
					.query("question_collections")
					.withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
					.take(500);
				return {
					...collection,
					questionCount: links.length,
				};
			})
		);
	},
});

export const getCollectionDetail = query({
	args: {
		collectionId: v.id("collections"),
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("collections"),
			_creationTime: v.number(),
			name: v.string(),
			organizationId: v.id("organizations"),
			questions: v.array(publicQuestionSummary),
		})
	),
	handler: async (ctx, args) => {
		const collection = await ctx.db.get(args.collectionId);
		if (!collection) {
			return null;
		}
		await ensurePaidOrganizationMember(ctx, collection.organizationId);

		const links = await ctx.db
			.query("question_collections")
			.withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
			.take(500);

		const questions = [];
		for (const link of links) {
			const question = await ctx.db.get(link.questionId);
			if (!question) {
				continue;
			}
			questions.push(toPublicQuestionSummary(question));
		}

		return {
			...collection,
			questions,
		};
	},
});

export const updateCollection = mutation({
	args: {
		collectionId: v.id("collections"),
		name: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const collection = await ctx.db.get(args.collectionId);
		if (!collection) {
			throw new Error("Collection not found");
		}
		await ensurePaidOrganizationMember(ctx, collection.organizationId, ["admin", "manager"]);

		const normalized = args.name.trim();
		if (!normalized) {
			throw new Error("Collection name cannot be empty");
		}

		await ctx.db.patch(args.collectionId, { name: normalized });
		return null;
	},
});

export const searchPublicQuestions = query({
	args: {
		searchText: v.string(),
		excludeQuestionIds: v.optional(v.array(v.id("questions"))),
		limit: v.optional(v.number()),
	},
	returns: v.array(publicQuestionSummary),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const normalized = args.searchText.trim().toLowerCase();
		if (normalized.length < MIN_PUBLIC_SEARCH_LENGTH) {
			return [];
		}

		const exclude = new Set(args.excludeQuestionIds ?? []);
		const limit = Math.min(args.limit ?? MAX_PUBLIC_SEARCH_RESULTS, MAX_PUBLIC_SEARCH_RESULTS);
		const pool = await loadPublicQuestionPool(ctx, MAX_PUBLIC_SEARCH_SCAN);
		const matches = [];

		for (const question of pool) {
			if (exclude.has(question._id)) {
				continue;
			}
			const text = (question.text ?? question.customText ?? "").toLowerCase();
			if (!text.includes(normalized)) {
				continue;
			}
			matches.push(toPublicQuestionSummary(question));
			if (matches.length >= limit) {
				break;
			}
		}

		return matches;
	},
});
