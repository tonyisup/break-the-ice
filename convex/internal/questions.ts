import { v } from "convex/values";
import { internalQuery, internalMutation, internalAction } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { embed } from "../lib/retriever";
import { getActiveTakeoverTopicsHelper } from "../lib/takeover";
import { cosineSimilarity } from "../lib/embeddings";

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
		const withEmbeddingIds = new Set(
			(await ctx.db.query("question_embeddings").collect()).map((e) => e.questionId)
		);
		const questions = await ctx.db
			.query("questions")
			.filter((q) => q.neq(q.field("text"), undefined))
			.take(500);
		const missing = questions.filter((q) => !withEmbeddingIds.has(q._id));
		return missing.slice(0, 10);
	},
});

export const addEmbedding = internalMutation({
	args: {
		questionId: v.id("questions"),
		embedding: v.array(v.float64()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const question = await ctx.db.get(args.questionId);
		if (!question) return null;
		const existing = await ctx.db
			.query("question_embeddings")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.first();
		const payload = {
			questionId: args.questionId,
			embedding: args.embedding,
			status: question.status,
			styleId: question.styleId,
			toneId: question.toneId,
			topicId: question.topicId,
		};
		if (existing) {
			await ctx.db.patch(existing._id, payload);
		} else {
			await ctx.db.insert("question_embeddings", payload);
		}
		return null;
	},
});

/** Sync status, styleId, toneId, topicId from question to its question_embeddings row (for vector search filters). */
export const syncQuestionEmbeddingFilters = internalMutation({
	args: { questionId: v.id("questions") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const question = await ctx.db.get(args.questionId);
		if (!question) return null;
		const row = await ctx.db
			.query("question_embeddings")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.first();
		if (!row) return null;
		await ctx.db.patch(row._id, {
			status: question.status,
			styleId: question.styleId,
			toneId: question.toneId,
			topicId: question.topicId,
		});
		return null;
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
		const withEmbeddingIds = new Set(
			(await ctx.db.query("question_embeddings").collect()).map((e) => e.questionId)
		);
		const questions = await ctx.db
			.query("questions")
			.filter((q) => q.neq(q.field("text"), undefined))
			.collect();
		return questions
			.filter((q) => !withEmbeddingIds.has(q._id))
			.map((q) => ({ _id: q._id, text: q.text }));
	},
});

export const getQuestionEmbedding = internalQuery({
	args: {
		questionId: v.id("questions"),
	},
	returns: v.union(v.null(), v.array(v.float64())),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("question_embeddings")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.first();
		if (!row) return null;
		return row.embedding;
	},
});

/** Resolve question_embeddings row ids to question ids (for vector search results).
 * Returns one entry per input embedding row id; null where the row is missing.
 * Positional correspondence with the input array is preserved for alignment with scores. */
export const getQuestionIdsByEmbeddingRowIds = internalQuery({
	args: { embeddingRowIds: v.array(v.id("question_embeddings")) },
	returns: v.array(v.union(v.id("questions"), v.null())),
	handler: async (ctx, args) => {
		const ids: (Id<"questions"> | null)[] = [];
		for (const rowId of args.embeddingRowIds) {
			const row = await ctx.db.get(rowId);
			ids.push(row?.questionId ?? null);
		}
		return ids;
	},
});

/** Returns embedding for each question id (only for ids that have an embedding). */
export const getEmbeddingsByQuestionIds = internalQuery({
	args: { questionIds: v.array(v.id("questions")) },
	returns: v.array(v.object({ questionId: v.id("questions"), embedding: v.array(v.number()) })),
	handler: async (ctx, args) => {
		const out: { questionId: Id<"questions">; embedding: number[] }[] = [];
		for (const questionId of args.questionIds) {
			const row = await ctx.db
				.query("question_embeddings")
				.withIndex("by_questionId", (q) => q.eq("questionId", questionId))
				.first();
			if (row) out.push({ questionId, embedding: row.embedding });
		}
		return out;
	},
});

export const getQuestionsWithEmbeddingsBatch = internalQuery({
	args: {
		cursor: v.union(v.string(), v.null()),
		limit: v.number(),
	},
	returns: v.object({
		questions: v.array(v.object({
			_id: v.id("questions"),
			text: v.optional(v.union(v.string(), v.null())),
			embedding: v.array(v.float64()),
		})),
		continueCursor: v.string(),
		isDone: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const { cursor, limit } = args;
		const paginationResult = await ctx.db
			.query("question_embeddings")
			.paginate({ cursor, numItems: limit });
		const questionIds = paginationResult.page.map((e) => e.questionId);
		const questions = await Promise.all(questionIds.map((id) => ctx.db.get(id)));
		const questionMap = new Map(questions.filter(Boolean).map((q) => [q!._id, q!]));
		const questionsWithEmbeddings = paginationResult.page.map((e) => {
			const q = questionMap.get(e.questionId);
			return {
				_id: e.questionId,
				text: q?.text,
				embedding: e.embedding,
			};
		});
		return {
			questions: questionsWithEmbeddings,
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

				const userEmb = await ctx.runQuery(internal.internal.users.getUserEmbedding, { userId: user._id });
				const poolIds = userQuestions.map((q) => q._id);
				const embMap = new Map(
					(await ctx.runQuery(internal.internal.questions.getEmbeddingsByQuestionIds, { questionIds: poolIds })).map(
						(e) => [e.questionId, e.embedding]
					)
				);
				if (userEmb && userEmb.length > 0) {
					userQuestions.sort((a, b) => {
						const embA = embMap.get(a._id);
						const embB = embMap.get(b._id);
						if (!embA || !embB) return 0;
						const simA = cosineSimilarity(userEmb, embA);
						const simB = cosineSimilarity(userEmb, embB);
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

		const results = await ctx.vectorSearch("question_embeddings", "by_embedding", {
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
		seen: v.array(v.id("questions")),
		hidden: v.array(v.id("questions")),
		hiddenStyles: v.array(v.id("styles")),
		hiddenTones: v.array(v.id("tones")),
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const { count, seen, hidden, hiddenStyles, hiddenTones, organizationId } = args;
		const seenIds = new Set(seen);
		const hiddenIds = new Set(hidden);
		const hiddenStyleIds = new Set(hiddenStyles);
		const hiddenToneIds = new Set(hiddenTones);

		const applyFilters = (q: any) => {
			const conditions = [
				q.neq(q.field("text"), undefined),
				q.eq(q.field("status"), "public"),
			];
			return q.and(...conditions);
		};

		// Collect all public questions so we can sample across the full set
		// rather than always returning the oldest rows via _creationTime order.
		// With ~300-1000 questions this is very efficient; the 1000-row cap
		// protects against unbounded growth.
		const allPublic = await ctx.db
			.query("questions")
			.filter((q) => applyFilters(q))
			.take(1000);

		const candidates = allPublic;

		// In-memory Fisher-Yates shuffle so each request samples randomly
		// across the full question set instead of always the oldest slice
		for (let i = candidates.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
		}

		// Post-filter for seen, hidden, styles, and tones
		const filtered = candidates.filter((q) => {
			if (seenIds.has(q._id)) return false;
			if (hiddenIds.has(q._id)) return false;
			if (q.styleId && hiddenStyleIds.has(q.styleId)) return false;
			if (q.toneId && hiddenToneIds.has(q.toneId)) return false;
			return true;
		});

		const activeTakeoverTopics = await getActiveTakeoverTopicsHelper(ctx);

		if (activeTakeoverTopics.length > 0) {
			const takeoverTopicIds = activeTakeoverTopics.map(t => t._id);
			let takeoverCandidates: any[] = [];

			for (const topicId of takeoverTopicIds) {
				const topicQs = await ctx.db.query("questions")
					.withIndex("by_topic", (q) => q.eq("topicId", topicId))
					.filter((q) => applyFilters(q))
					.collect();

				takeoverCandidates = takeoverCandidates.concat(topicQs);
			}

			// Filter takeover candidates
			const filteredTakeover = takeoverCandidates.filter((q) => {
				if (seenIds.has(q._id)) return false;
				if (hiddenIds.has(q._id)) return false;
				if (q.styleId && hiddenStyleIds.has(q.styleId)) return false;
				if (q.toneId && hiddenToneIds.has(q.toneId)) return false;
				return true;
			});

			// Shuffle takeover candidates
			for (let i = filteredTakeover.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[filteredTakeover[i], filteredTakeover[j]] = [filteredTakeover[j], filteredTakeover[i]];
			}

			return filteredTakeover.slice(0, count + 10);
		}

		// Return enough candidates to fill the requested count after the
		// caller's own shuffle + slice. Account for all exclusion sources.
		const exclusionCount = seenIds.size + hiddenIds.size + hiddenStyleIds.size + hiddenToneIds.size;
		const returnCount = Math.min(Math.max(count + exclusionCount + 10, 50), 500);

		const now = Date.now();

		// pull any active topics, find a question that has that topic, and inject it if there is one
		const activeTopics = await ctx.db.query("topics")
			.withIndex("by_startDate_endDate_order", (q) => q.lt("startDate", now))
			.filter((q) => q.or(q.eq(q.field("endDate"), undefined), q.gt(q.field("endDate"), now)))
			.collect()

		if (activeTopics.length > 0) {
			const existingIds = new Set(filtered.map(q => q._id));
			for (const activeTopic of activeTopics) {
				const topicQuestions = await ctx.db.query("questions")
					.withIndex("by_topic", (q) => q.eq("topicId", activeTopic._id))
					.filter((q) => applyFilters(q))
					.take(10); // Take a few to find one that isn't filtered out

				const validTopicQuestion = topicQuestions.find(q => {
					if (hiddenIds.has(q._id)) return false;
					if (q.styleId && hiddenStyleIds.has(q.styleId)) return false;
					if (q.toneId && hiddenToneIds.has(q.toneId)) return false;
					return true;
				});

				if (validTopicQuestion) {
					filtered.push(validTopicQuestion);
					existingIds.add(validTopicQuestion._id);
				}
			}
		}

		return filtered.slice(0, returnCount);
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


export const getUnseenQuestionIdsForUser = internalQuery({
	args: {
		userId: v.id("users"),
		count: v.optional(v.number()),
	},
	returns: v.array(v.id("questions")),
	handler: async (ctx, args) => {
		const { userId, count } = args;
		const unseenUserQuestions = count ? await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", userId).eq("status", "unseen")
			)
			.take(count) : await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", userId).eq("status", "unseen")
			)
			.collect();

		const questionIds = unseenUserQuestions.map((uq) => uq.questionId);

		return questionIds;
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


export const getQuestionForNewsletter = internalQuery({
	args: {
		userId: v.id("users"),
		randomSeed: v.optional(v.float64()),
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const { userId, randomSeed } = args;
		const user = await ctx.db.get(userId);
		if (!user) {
			return null;
		}

		// PRIORITY 1: Check for unseen pool questions first
		const unseenUserQuestion = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", userId).eq("status", "unseen")
			)
			.order("asc")
			.first();

		if (unseenUserQuestion) {
			const unseenQuestion = await ctx.db.get(unseenUserQuestion.questionId);
			if (unseenQuestion && !unseenQuestion.prunedAt && unseenQuestion.text) {
				return unseenQuestion;
			}
		}

		// FALLBACK: Random selection from pool
		const userQuestions = await ctx.db.query("userQuestions")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();
		const seenIds = new Set(userQuestions.map((uq) => uq.questionId));

		const userHiddenStyles = await ctx.db.query("userStyles")
			.withIndex("by_userId_status", (q) => q
				.eq("userId", args.userId)
				.eq("status", "hidden")
			)
			.collect();
		const hiddenStyleIds = new Set(userHiddenStyles.map((s) => s.styleId));

		const userHiddenTones = await ctx.db.query("userTones")
			.withIndex("by_userId_status", (q) => q
				.eq("userId", args.userId)
				.eq("status", "hidden")
			)
			.collect();
		const hiddenToneIds = new Set(userHiddenTones.map((t) => t.toneId));

		const rawCandidates = await ctx.db
			.query("questions")
			.withIndex("by_prunedAt_status_text", (q) => q.eq("prunedAt", undefined))
			.filter((q: any) => q.and(
				q.neq(q.field("text"), undefined),
				q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
			))
			.take(1000);

		const candidates = rawCandidates
			.filter((q) => !seenIds.has(q._id))
			.filter((q) => !q.styleId || !hiddenStyleIds.has(q.styleId))
			.filter((q) => !q.toneId || !hiddenToneIds.has(q.toneId))
			.slice(0, 50);

		if (candidates.length === 0) {
			return null;
		}

		const seed = randomSeed ?? Math.random();
		const normalizedSeed = seed - Math.floor(seed);
		const randomIndex = Math.floor(normalizedSeed * candidates.length);
		return candidates[randomIndex];
	},
});


export const markUserQuestionAsSent = internalMutation({
	args: {
		userId: v.id("users"),
		questionId: v.id("questions"),
	},
	handler: async (ctx, args) => {	
		const userQuestion = await ctx.db.query("userQuestions").filter((q) => q.eq(q.field("userId"), args.userId)).filter((q) => q.eq(q.field("questionId"), args.questionId)).first();
		if (userQuestion) {
			await ctx.db.patch(userQuestion._id, {
				status: "sent",
				updatedAt: Date.now(),
			});
			return;
		}	

		await ctx.db.insert("userQuestions", {
			userId: args.userId,
			questionId: args.questionId,
			status: "sent",	
			viewDuration: 0,
			seenCount: 0,
			updatedAt: Date.now(),
		});
	},
});