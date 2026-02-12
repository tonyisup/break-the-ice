import { v } from "convex/values";
import { internalQuery, internalMutation, internalAction } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { embed } from "../lib/retriever";

// Helper: Simple cosine similarity for preference matching
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


export const getQuestionById = internalQuery({
	args: { id: v.id("questions") },
	returns: v.nullable(v.object({
		_id: v.id("questions"),
		_creationTime: v.number(),
		organizationId: v.optional(v.id("organizations")),
		averageViewDuration: v.number(),
		lastShownAt: v.optional(v.number()),
		text: v.optional(v.string()),
		totalLikes: v.number(),
		totalThumbsDown: v.optional(v.number()),
		totalShows: v.number(),
		isAIGenerated: v.optional(v.boolean()),
		tags: v.optional(v.array(v.string())),
		style: v.optional(v.string()),
		styleId: v.optional(v.id("styles")),
		tone: v.optional(v.string()),
		toneId: v.optional(v.id("tones")),
		topic: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
		embedding: v.optional(v.array(v.number())),
		authorId: v.optional(v.string()),
		customText: v.optional(v.string()),
		status: v.optional(v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("public"),
			v.literal("private"),
			v.literal("pruning"),
			v.literal("pruned")
		)),
		prunedAt: v.optional(v.number()),
		lastPostedAt: v.optional(v.number()),
		poolDate: v.optional(v.string()),
		poolStatus: v.optional(v.union(
			v.literal("available"),
			v.literal("distributed")
		)),
	})),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

export const getQuestionsToEmbed = internalQuery({
	args: {
		startCreationTime: v.optional(v.number()),
		startQuestionId: v.optional(v.id("questions")),
	},
	handler: async (ctx, args) => {
		const questions = await ctx.db
			.query("questions")
			.withIndex("by_creation_time")
			.order("desc")
			.filter((q) => q.eq(q.field("embedding"), undefined))
			.take(10);
		return questions;
	},
});

export const addEmbedding = internalMutation({
	args: {
		questionId: v.id("questions"),
		embedding: v.array(v.float64()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.questionId, {
			embedding: args.embedding,
		});
	},
});

// Get all questions for duplicate detection (minimal data for efficiency)
export const getAllQuestionsForDuplicateDetection = internalQuery({
	args: {},
	returns: v.array(v.object({
		_id: v.id("questions"),
		text: v.optional(v.string()),
		style: v.string(),
	})),
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").collect();
		const duplicateDetections = await ctx.db.query("duplicateDetections").collect();
		const duplicateQuestionIds = duplicateDetections.flatMap(d => d.questionIds);
		const filteredQuestions = questions.filter(q => !duplicateQuestionIds.includes(q._id));

		const result: Array<{ _id: Id<"questions">, text: string, style: string }> = [];
		for (const q of filteredQuestions) {
			if (q._id && q.text) {
				result.push({
					_id: q._id,
					text: q.text,
					style: q.style ?? "",
				});
			}
		}
		return result;
	},
});

// Save duplicate detection results
export const saveDuplicateDetection = internalMutation({
	args: {
		questionIds: v.array(v.id("questions")),
		reason: v.string(),
		confidence: v.number(),
	},
	returns: v.union(v.id("duplicateDetections"), v.null()),
	handler: async (ctx, args) => {
		const sortedIds = [...args.questionIds].sort();
		const uniqueKey = sortedIds.join("_");
		const existing = await ctx.db
			.query("duplicateDetections")
			.withIndex("by_uniqueKey", (q) => q.eq("uniqueKey", uniqueKey))
			.first();

		if (existing) {
			return null;
		}

		return await ctx.db.insert("duplicateDetections", {
			questionIds: sortedIds,
			uniqueKey,
			reason: args.reason,
			confidence: args.confidence,
			status: "pending",
		});
	},
});

// Internal query to get question counts by style and tone combination
export const getQuestionCountsByStyleAndTone = internalQuery({
	args: {},
	returns: v.array(v.object({
		style: v.string(),
		tone: v.string(),
		count: v.number(),
	})),
	handler: async (ctx) => {
		const questions = await ctx.db
			.query("questions")
			.filter((q) => q.and(
				q.neq(q.field("style"), undefined),
				q.neq(q.field("tone"), undefined)
			))
			.collect();

		const counts = new Map<string, number>();

		for (const question of questions) {
			if (question.style && question.tone) {
				const key = `${question.style}|${question.tone}`;
				counts.set(key, (counts.get(key) || 0) + 1);
			}
		}

		return Array.from(counts.entries()).map(([key, count]) => {
			const [style, tone] = key.split('|');
			return { style, tone, count };
		});
	},
});

export const getQuestionsWithMissingEmbeddings = internalQuery({
	args: {},
	returns: v.array(v.object({
		_id: v.id("questions"),
		text: v.optional(v.string()),
	})),
	handler: async (ctx) => {
		const questions = await ctx.db.query("questions").filter((q) => q.and(
			q.neq(q.field("text"), undefined),
			q.eq(q.field("embedding"), undefined)
		)).collect();

		const result = [];
		for (const q of questions) {
			result.push({
				_id: q._id,
				text: q.text,
			});
		}
		return result;
	}
});

export const getQuestionEmbedding = internalQuery({
	args: {
		questionId: v.id("questions"),
	},
	handler: async (ctx, args) => {
		const question = await ctx.db.query("questions").withIndex("by_id", (q) => q.eq("_id", args.questionId)).first();
		if (!question) {
			return [];
		}
		return question.embedding;
	},
});

export const getQuestionsWithEmbeddingsBatch = internalQuery({
	args: {
		cursor: v.union(v.string(), v.null()),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		const { cursor, limit } = args;
		const paginationResult = await ctx.db
			.query("questions")
			.filter((q) => q.neq(q.field("embedding"), undefined))
			.paginate({ cursor, numItems: limit });

		return {
			questions: paginationResult.page.map(q => ({
				_id: q._id,
				text: q.text,
				embedding: q.embedding,
			})),
			continueCursor: paginationResult.continueCursor,
			isDone: paginationResult.isDone,
		};
	},
});

export const countQuestions = internalQuery({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		return (await ctx.db.query("questions").collect()).length;
	},
});

// Helper: Check if exact question text already exists
export const checkExactDuplicate = internalQuery({
	args: {
		text: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("questions")
			.withIndex("by_text", (q) => q.eq("text", args.text))
			.first();
		return existing !== null;
	},
});

// Helper: Save a pool question with proper metadata
export const savePoolQuestion = internalMutation({
	args: {
		text: v.string(),
		styleId: v.id("styles"),
		style: v.string(),
		toneId: v.id("tones"),
		tone: v.string(),
		poolDate: v.string(),
	},
	returns: v.union(v.id("questions"), v.null()),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("questions")
			.withIndex("by_text", (q) => q.eq("text", args.text))
			.first();

		if (existing) {
			return null;
		}

		return await ctx.db.insert("questions", {
			text: args.text,
			styleId: args.styleId,
			style: args.style,
			toneId: args.toneId,
			tone: args.tone,
			poolDate: args.poolDate,
			poolStatus: "available",
			status: "public",
			isAIGenerated: true,
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
			lastShownAt: 0,
		});
	},
});

// Get available pool questions for a specific date
export const getAvailablePoolQuestions = internalQuery({
	args: {
		poolDate: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const limit = args.limit ?? 100;
		return await ctx.db
			.query("questions")
			.withIndex("by_poolDate_and_poolStatus", (q) =>
				q.eq("poolDate", args.poolDate).eq("poolStatus", "available")
			)
			.take(limit);
	},
});

// Mark pool questions as distributed
export const markPoolQuestionsDistributed = internalMutation({
	args: {
		questionIds: v.array(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		for (const id of args.questionIds) {
			await ctx.db.patch(id, { poolStatus: "distributed" });
		}
		return null;
	},
});

// Assign pool questions to a single user as unseen
export const assignPoolQuestionsToUser = internalMutation({
	args: {
		userId: v.id("users"),
		questionIds: v.array(v.id("questions")),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const { userId, questionIds } = args;
		let assigned = 0;

		for (const questionId of questionIds) {
			const existing = await ctx.db
				.query("userQuestions")
				.withIndex("by_userIdAndQuestionId", (q) =>
					q.eq("userId", userId).eq("questionId", questionId)
				)
				.first();

			if (!existing) {
				await ctx.db.insert("userQuestions", {
					userId,
					questionId,
					status: "unseen",
					updatedAt: Date.now(),
				});
				assigned++;
			}
		}

		return assigned;
	},
});

// Internal query: Check if any newsletter subscriber has fewer than N unseen questions
export const getUsersWithLowUnseenCount = internalQuery({
	args: {
		threshold: v.number(),
	},
	returns: v.array(v.id("users")),
	handler: async (ctx, args) => {
		const subscribers = await ctx.db
			.query("users")
			.withIndex("by_newsletterSubscriptionStatus", (q) =>
				q.eq("newsletterSubscriptionStatus", "subscribed")
			)
			.collect();

		if (subscribers.length === 0) {
			return [];
		}

		for (const user of subscribers) {
			const unseenQuestions = await ctx.db
				.query("userQuestions")
				.withIndex("by_userId_status_updatedAt", (q) =>
					q.eq("userId", user._id).eq("status", "unseen")
				)
				.take(args.threshold);

			if (unseenQuestions.length < args.threshold) {
				return subscribers.map(s => s._id);
			}
		}

		return [];
	},
});

// Internal action: Assign pool questions to all newsletter subscribers
export const assignPoolQuestionsToUsers = internalAction({
	args: {
		questionsPerUser: v.number(),
	},
	returns: v.object({
		usersProcessed: v.number(),
		totalAssigned: v.number(),
		errors: v.array(v.string()),
	}),
	handler: async (ctx, args) => {
		const { questionsPerUser } = args;
		const today = new Date().toISOString().split('T')[0];

		let usersProcessed = 0;
		let totalAssigned = 0;
		const errors: Array<string> = [];

		const poolQuestions: Array<Doc<"questions">> = await ctx.runQuery(
			internal.internal.questions.getAvailablePoolQuestions,
			{ poolDate: today, limit: 200 }
		);

		if (poolQuestions.length === 0) {
			console.log("No pool questions available for today");
			return { usersProcessed: 0, totalAssigned: 0, errors: ["No pool questions available"] };
		}

		const subscribers: Array<Doc<"users">> = await ctx.runQuery(
			internal.internal.users.getNewsletterSubscribers,
			{}
		);

		const { hiddenStyles: allHiddenStyles, hiddenTones: allHiddenTones }: { hiddenStyles: Array<any>, hiddenTones: Array<any> } = await ctx.runQuery(
			internal.internal.users.getHiddenPreferencesForUsers,
			{ userIds: subscribers.map(u => u._id) }
		);

		const hiddenStylesByUser = new Map<string, Set<string>>();
		const hiddenTonesByUser = new Map<string, Set<string>>();

		for (const hs of allHiddenStyles) {
			const userId = hs.userId.toString();
			if (!hiddenStylesByUser.has(userId)) {
				hiddenStylesByUser.set(userId, new Set());
			}
			hiddenStylesByUser.get(userId)!.add(hs.styleId.toString());
		}

		for (const ht of allHiddenTones) {
			const userId = ht.userId.toString();
			if (!hiddenTonesByUser.has(userId)) {
				hiddenTonesByUser.set(userId, new Set());
			}
			hiddenTonesByUser.get(userId)!.add(ht.toneId.toString());
		}

		const assignedQuestionIds = new Set<Id<"questions">>();

		for (const user of subscribers) {
			try {
				usersProcessed++;

				const hiddenStyleIds = hiddenStylesByUser.get(user._id.toString()) ?? new Set();
				const hiddenToneIds = hiddenTonesByUser.get(user._id.toString()) ?? new Set();

				let userQuestions = poolQuestions.filter(q => {
					if (q.styleId && hiddenStyleIds.has(q.styleId.toString())) return false;
					if (q.toneId && hiddenToneIds.has(q.toneId.toString())) return false;
					return true;
				});

				if (user.questionPreferenceEmbedding && user.questionPreferenceEmbedding.length > 0) {
					userQuestions.sort((a, b) => {
						if (!a.embedding || !b.embedding) return 0;
						const simA = cosineSimilarity(user.questionPreferenceEmbedding!, a.embedding);
						const simB = cosineSimilarity(user.questionPreferenceEmbedding!, b.embedding);
						return simB - simA;
					});
				} else {
					for (let i = userQuestions.length - 1; i > 0; i--) {
						const j = Math.floor(Math.random() * (i + 1));
						[userQuestions[i], userQuestions[j]] = [userQuestions[j], userQuestions[i]];
					}
				}

				const toAssign = userQuestions.slice(0, questionsPerUser);
				const questionIds = toAssign.map(q => q._id);

				if (questionIds.length > 0) {
					const assigned: number = await ctx.runMutation(
						internal.internal.questions.assignPoolQuestionsToUser,
						{ userId: user._id, questionIds }
					);
					totalAssigned += assigned;

					for (const qid of questionIds) {
						assignedQuestionIds.add(qid);
					}
				}

			} catch (error: any) {
				errors.push(`Error assigning to user ${user._id}: ${error.message}`);
			}
		}

		if (assignedQuestionIds.size > 0) {
			const _: null = await ctx.runMutation(internal.internal.questions.markPoolQuestionsDistributed, {
				questionIds: Array.from(assignedQuestionIds),
			});
		}

		if (usersProcessed > 0) {
			const subject = `📬 Pool Questions Assigned: ${totalAssigned} to ${usersProcessed} users`;
			const html = `
        <h2>Pool Question Assignment Summary</h2>
        <p><strong>Date:</strong> ${today}</p>
        <p><strong>Users Processed:</strong> ${usersProcessed}</p>
        <p><strong>Total Questions Assigned:</strong> ${totalAssigned}</p>
        <p><strong>Questions Per User Target:</strong> ${questionsPerUser}</p>
        ${errors.length > 0 ? `<h3>Errors (${errors.length})</h3><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
      `;
			await ctx.runAction(internal.email.sendEmail, { subject, html });
		}

		return { usersProcessed, totalAssigned, errors };
	},
});

// Check for similarity using vector search (Action-only in Convex)
export const checkSimilarity = internalAction({
	args: {
		text: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args): Promise<boolean> => {
		const embedding = await embed(args.text);
		if (embedding.length === 0) return false;

		const results = await ctx.vectorSearch("questions", "by_embedding", {
			vector: embedding,
			limit: 1,
		});

		if (results.length === 0) return false;

		const topScore = results[0]._score;
		return topScore >= 0.9;
	},
});

// Internal query to get random questions with proper filtering
export const getRandomQuestionsInternal = internalQuery({
	args: {
		count: v.number(),
		startTime: v.number(),
		seen: v.array(v.id("questions")),
		hidden: v.array(v.id("questions")),
		hiddenStyles: v.array(v.id("styles")),
		hiddenTones: v.array(v.id("tones")),
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const { count, startTime, seen, hidden, hiddenStyles, hiddenTones, organizationId } = args;
		const seenIds = new Set(seen);
		const hiddenIds = new Set(hidden);
		const hiddenStyleIds = new Set(hiddenStyles);
		const hiddenToneIds = new Set(hiddenTones);

		const applyFilters = (q: any) => {
			const conditions = [
				q.eq(q.field("organizationId"), organizationId),
				q.eq(q.field("prunedAt"), undefined),
				q.neq(q.field("text"), undefined),
				q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
			];
			return q.and(...conditions);
		};

		// 1. Fetch candidates from random start point
		const candidatesWithEmbeddings = await ctx.db
			.query("questions")
			.withIndex("by_creation_time", (q) => q.gt("_creationTime", startTime))
			.filter((q) => applyFilters(q))
			.take(count * 5);

		let candidates = candidatesWithEmbeddings.map(q => {
			const { embedding, ...rest } = q;
			return rest;
		});

		// 2. Wrap around if needed
		if (candidates.length < count * 2) {
			const moreCandidates = await ctx.db
				.query("questions")
				.withIndex("by_creation_time")
				.filter((q) => applyFilters(q))
				.take(count * 5 - candidates.length);

			const existingIds = new Set(candidates.map((q) => q._id));
			for (const q of moreCandidates) {
				if (!existingIds.has(q._id)) {
					candidates.push(q);
					existingIds.add(q._id);
				}
			}
		}

		// 3. Post-filter for seen, hidden, styles, and tones
		const filtered = candidates.filter((q) => {
			if (seenIds.has(q._id)) return false;
			if (hiddenIds.has(q._id)) return false;
			if (q.styleId && hiddenStyleIds.has(q.styleId)) return false;
			if (q.toneId && hiddenToneIds.has(q.toneId)) return false;
			return true;
		});


		return filtered;
	},
});

// Get the time range of all questions for randomization
export const getQuestionTimeRange = internalQuery({
	args: {},
	returns: v.object({
		minTime: v.number(),
		maxTime: v.number(),
	}),
	handler: async (ctx) => {
		const firstQ = await ctx.db.query("questions").withIndex("by_creation_time").order("asc").first();
		const lastQ = await ctx.db.query("questions").withIndex("by_creation_time").order("desc").first();
		return {
			minTime: firstQ?._creationTime ?? 0,
			maxTime: lastQ?._creationTime ?? 0,
		};
	},
});


export const getUnseenQuestionsForUser = internalQuery({
	args: {
		userId: v.id("users"),
		count: v.number(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const { userId, count } = args;
		const unseenUserQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", userId).eq("status", "unseen")
			)
			.take(count);

		const questions = await Promise.all(
			unseenUserQuestions.map((uq) => ctx.db.get(uq.questionId))
		);

		return questions
			.filter((q) => q !== null && !q.prunedAt && q.text)
			.slice(0, count);
	},
});

export const getSentQuestionsForUser = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.array(v.id("questions")),
	handler: async (ctx, args) => {
		const { userId } = args;
		const sentQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", userId).eq("status", "sent")
			)
			.collect();
		return sentQuestions.map((q) => q.questionId);
	},
});

