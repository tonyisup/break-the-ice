import { v } from "convex/values";
import { mutation, query, QueryCtx, action, ActionCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { embed } from "../lib/retriever";

export const calculateAverageEmbedding = (embeddings: number[][]) => {
	const validEmbeddings = embeddings.filter((e) => e && e.length > 0);

	if (validEmbeddings.length === 0) {
		return [];
	}

	const embeddingLength = validEmbeddings[0].length;
	const sumEmbedding = new Array(embeddingLength).fill(0);

	let validCount = 0;
	for (const embedding of validEmbeddings) {
		if (embedding.length !== embeddingLength) {
			console.warn("Embedding length mismatch ignoring:", embedding.length);
			continue;
		}
		for (let i = 0; i < embeddingLength; i++) {
			sumEmbedding[i] += embedding[i];
		}
		validCount++;
	}

	if (validCount === 0) {
		return [];
	}

	return sumEmbedding.map((value) => value / validCount);
};

export const discardQuestion = mutation({
	args: {
		questionId: v.id("questions"),
		startTime: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { questionId, startTime } = args;

		const question = await ctx.db.get(questionId);
		if (question) {

			const analytics = ctx.db.insert("analytics", {
				questionId,
				viewDuration: Date.now() - startTime,
				event: "seen",
				timestamp: Date.now(),
			});

			const updateQuestion = ctx.db.patch(questionId, {
				totalShows: question.totalShows + 1,
				totalThumbsDown: (question.totalThumbsDown ?? 0) + 1,
				lastShownAt: Date.now(),
			});

			await Promise.all([analytics, updateQuestion]);
		}
		return null;
	},
});

export const getUnseenQuestionsForUser = query({
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

export const getSentQuestionsForUser = query({
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

export const getNextUnseenQuestions = action({
	args: {
		userId: v.id("users"),
		count: v.number(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const questions = await ctx.runQuery(api.core.questions.getUnseenQuestionsForUser, args);
		
		return questions.slice(0, args.count);
	},
});

export const getNextRandomQuestionsUnsentForUser = action({
	args: {
		userId: v.id("users"),
		count: v.number(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const { userId, count } = args;
		const seen = await ctx.runQuery(api.core.questions.getSentQuestionsForUser, {
			userId: userId
		});

		if (seen.length === 0) {
			return await ctx.runAction(api.core.questions.getNextRandomQuestions, {
				count: count
			});
		}

		return await ctx.runAction(api.core.questions.getNextRandomQuestions, {
			seen: seen,
			count: count,
		});
	},
});

export const getNextRandomQuestionsUnsent = action({
	args: {
		count: v.number(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}
		const user = await ctx.runQuery(api.core.users.getCurrentUser, {});
		if (!user) {
			throw new Error("User not found");
		}
		return await ctx.runAction(api.core.questions.getNextRandomQuestionsUnsentForUser, {
			userId: user._id,
			count: args.count
		});
	},
});

export const addPersonalQuestion = mutation({
	args: {
		customText: v.string(),
		authorId: v.optional(v.id("users")),
		isPublic: v.boolean(),
	},
	returns: v.union(v.id("questions"), v.null()),
	handler: async (ctx, args) => {
		let userId;
		if (args.authorId) {
			userId = args.authorId;
		} else {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				throw new Error("You must be logged in to add a personal question.");
			}
			const user = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", identity.email))
				.unique();
			if (!user) {
				throw new Error("User not found.");
			}
			userId = user._id;
		}

		const { customText, isPublic } = args;
		if (customText.trim().length === 0) {
			// do not save empty questions
			return null;
		}
		return await ctx.db.insert("questions", {
			authorId: userId,
			customText,
			status: isPublic ? "pending" : "private",
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
	},
});

function mulberry32(a: number) {
	return function () {
		let t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}
const shuffleArray = (array: any[], seed?: number) => {
	let s = seed ?? Date.now();
	if (seed !== undefined && seed < 1) {
		s = seed * 4294967296;
	}
	const random = mulberry32(s);
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
}

export const getSimilarQuestions = query({
	args: {
		count: v.float64(),
		style: v.string(),
		tone: v.string(),
		seen: v.optional(v.array(v.id("questions"))),
		hidden: v.optional(v.array(v.id("questions"))),
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const { count, style, tone, seen, hidden, organizationId } = args;

		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) {
			return [];
		}
		const likedQuestionsDocs = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();

		const likedQuestionIds = likedQuestionsDocs.map((uq) => uq.questionId);

		// Use regular query with filter instead of vectorSearch since it's not available in queries
		const candidates = await ctx.db
			.query("questions")
			.withIndex("by_style_and_tone", (q: any) => q.eq("style", style).eq("tone", tone))
			.filter((q: any) => q.eq(q.field("organizationId"), organizationId))
			.filter((q: any) => q.eq(q.field("prunedAt"), undefined))
			.filter((q: any) => q.and(
				q.neq(q.field("text"), undefined),
				q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
				...(hidden ?? []).map((id: any) => q.neq(q.field("_id"), id)),
				...(seen ?? []).map((id: any) => q.neq(q.field("_id"), id)),
				...likedQuestionIds.map((id: any) => q.neq(q.field("_id"), id))
			))
			.take(count * 4);

		return candidates;
	},
});

export const getNextRandomQuestions = action({
	args: {
		count: v.float64(),
		seen: v.optional(v.array(v.id("questions"))),
		hidden: v.optional(v.array(v.id("questions"))),
		hiddenStyles: v.optional(v.array(v.id("styles"))),
		hiddenTones: v.optional(v.array(v.id("tones"))),
		organizationId: v.optional(v.id("organizations")),
		randomSeed: v.optional(v.float64()),
	},
	handler: async (ctx, args): Promise<any[]> => {
		const { count, seen = [], hidden = [], hiddenStyles = [], hiddenTones = [], organizationId, randomSeed = Math.random() } = args;

		// 1. Get time range for randomization
		const { minTime, maxTime } = await ctx.runQuery(internal.internal.questions.getQuestionTimeRange);

		let startTime = 0;
		if (maxTime > minTime) {
			const normalizedSeed = randomSeed - Math.floor(randomSeed);
			startTime = minTime + normalizedSeed * (maxTime - minTime);
		}

		// 2. Fetch candidates using internal query
		const candidates = await ctx.runQuery(internal.internal.questions.getRandomQuestionsInternal, {
			count,
			startTime,
			seen,
			hidden,
			hiddenStyles,
			hiddenTones,
			organizationId,
		});

		// 3. Shuffle results (deterministic based on seed)
		const results = [...candidates];
		shuffleArray(results, randomSeed);

		return results.slice(0, count);
	},
});

export const getQuestionForNewsletter = query({
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

/**
 * Shared logic for finding nearest questions by embedding.
 * Extracted into a helper to avoid action-to-action chaining.
 */
async function getNearestQuestionsByEmbeddingInternal(
	ctx: ActionCtx,
	args: {
		embedding: number[];
		style?: string;
		tone?: string;
		count?: number;
	}
) {
	const { embedding, style, tone, count } = args;
	if (!embedding || embedding.length === 0) {
		return [];
	}
	const requestedCount = count ?? 10;
	const limit = requestedCount * 10;

	const results = await ctx.vectorSearch("questions", "by_embedding", {
		vector: embedding,
		limit,
	});

	const ids = results.map((r) => r._id);
	if (ids.length === 0) return [];

	const questions = (await ctx.runQuery(api.core.questions.getQuestionsByIds, { ids })) as any[];

	const filtered = questions.filter((q) => {
		if (q.prunedAt !== undefined) return false;
		if (q.text === undefined) return false;
		if (q.status !== "approved" && q.status !== undefined) return false;

		if (style && q.style !== style) return false;
		if (tone && q.tone !== tone) return false;

		return true;
	});

	return filtered.slice(0, requestedCount);
}

export const getQuestionForNewsletterWithFallback = action({
	args: {
		userId: v.id("users"),
		randomSeed: v.optional(v.float64()),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args): Promise<Doc<"questions"> | null> => {
		// 1. Try to get an existing question they haven't seen via query
		const question: Doc<"questions"> | null = await ctx.runQuery(api.core.questions.getQuestionForNewsletter, {
			userId: args.userId,
			randomSeed: args.randomSeed ?? Math.random(),
		});

		if (question) {
			return question;
		}

		// 2. If no question found, generate a new one via action
		try {
			const generatedQuestions: (Doc<"questions"> | null)[] = await ctx.runAction(api.core.ai.generateAIQuestionForFeed, {
				userId: args.userId,
			});

			if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
				return generatedQuestions[0];
			}
			return (generatedQuestions as any) || null;
		} catch (error) {
			console.error("Failed to generate question for newsletter fallback:", error);
			return null;
		}
	},
});

export const getNextQuestions = query({
	args: {
		count: v.float64(),
		style: v.id("styles"),
		tone: v.id("tones"),
		seen: v.optional(v.array(v.id("questions"))),
		hidden: v.optional(v.array(v.id("questions"))),
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const { count, style, tone, seen, hidden, organizationId } = args;
		const seenIds = new Set(seen ?? []);

		const filteredQuestions = await ctx.db
			.query("questions")
			.withIndex("by_style_and_tone", (q) => q.eq("styleId", style).eq("toneId", tone))
			.filter((q) => q.eq(q.field("organizationId"), organizationId))
			.filter((q) => q.eq(q.field("prunedAt"), undefined))
			.filter((q) => q.and(
				q.neq(q.field("text"), undefined),
				q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined))
			))
			.filter((q) => q.and(... (hidden ?? []).map(hiddenId => q.neq(q.field("_id"), hiddenId))))
			.filter((q) => q.and(... (seen ?? []).map(seenId => q.neq(q.field("_id"), seenId))))
			.collect();

		const unseenQuestions = filteredQuestions.filter(q => !seenIds.has(q._id));
		if (unseenQuestions.length > 0) {
			shuffleArray(unseenQuestions);
			return unseenQuestions.slice(0, count).map(({ embedding, ...question }) => question);;
		}

		shuffleArray(filteredQuestions);
		return filteredQuestions.slice(0, count).map(({ embedding, ...question }) => question);
	}
})

export const recordAnalytics = mutation({
	args: {
		questionId: v.id("questions"),
		event: v.union(
			v.literal("seen"),
			v.literal("liked"),
			v.literal("shared"),
			v.literal("hidden"),
		),
		viewDuration: v.float64(),
		sessionId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { questionId, event, viewDuration, sessionId } = args;
		const question = await ctx.db.get(questionId);
		if (!question) return;

		const identity = await ctx.auth.getUserIdentity();
		let userId = null;
		if (identity) {
			const user = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", identity.email))
				.unique();
			if (user) {
				userId = user._id;
			}
		}

		await ctx.db.insert("analytics", {
			questionId,
			event,
			viewDuration,
			timestamp: Date.now(),
			userId: userId ?? undefined,
			sessionId,
		});

		if (event === "liked") {
			await ctx.db.patch(questionId, {
				totalLikes: question.totalLikes + 1,
			});
		}

		// Update average view duration
		const newAverage =
			(question.averageViewDuration * question.totalShows + viewDuration) /
			(question.totalShows + 1);

		await ctx.db.patch(questionId, {
			averageViewDuration: newAverage,
			totalShows: question.totalShows + 1,
			lastShownAt: Date.now(),
		});

		// Update userQuestions if user is logged in
		if (userId) {
			const userQuestion = await ctx.db
				.query("userQuestions")
				.withIndex("by_userIdAndQuestionId", (q) =>
					q.eq("userId", userId!).eq("questionId", questionId)
				)
				.first();

			if (userQuestion) {
				let newStatus = userQuestion.status;
				if (event === "liked") {
					newStatus = "liked";
				} else if (event === "hidden") {
					newStatus = "hidden";
				} else if (userQuestion.status === "unseen") {
					newStatus = "seen";
				}

				await ctx.db.patch(userQuestion._id, {
					viewDuration: userQuestion.viewDuration ? userQuestion.viewDuration + viewDuration : viewDuration,
					seenCount: userQuestion.seenCount ? userQuestion.seenCount + 1 : 1,
					updatedAt: Date.now(),
					status: (event === "hidden" || userQuestion.status === "hidden")
						? "hidden"
						: (event === "liked" || userQuestion.status === "liked")
							? "liked"
							: (userQuestion.status === "unseen" ? "seen" : userQuestion.status),
				});
			} else {
				await ctx.db.insert("userQuestions", {
					userId,
					questionId,
					status: event === "liked" ? "liked" : (event === "hidden" ? "hidden" : "seen"),
					viewDuration,
					seenCount: 1,
					updatedAt: Date.now(),
				});
			}
		}

		return null;
	},
});

export const getQuestionsByIds = query({
	args: {
		ids: v.array(v.id("questions")),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const { ids } = args;

		const validIds = ids.filter(id => {
			try {
				return typeof id === 'string' && id.length > 0;
			} catch {
				return false;
			}
		});

		if (validIds.length === 0) {
			return [];
		}

		const questions = await Promise.all(
			validIds.map((id) => ctx.db.get(id))
		);
		return questions.filter((q): q is Doc<"questions"> => q !== null);
	},
});

export const getUserLikedAndPreferredEmbedding = query({
	args: {},
	returns: v.array(v.number()),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) {
			return [];
		}
		const likedQuestionIds = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();
		const likedQuestions = await Promise.all(
			likedQuestionIds.map((q) => ctx.db.get(q.questionId))
		);
		const embeddings = likedQuestions
			.map((q) => q?.embedding)
			.filter((e) => e !== undefined);
		const results = calculateAverageEmbedding([...embeddings, user.questionPreferenceEmbedding ?? []]);
		return results;
	},
});

export const getCustomQuestions = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const userIdentity = await ctx.auth.getUserIdentity();
		if (!userIdentity) {
			return [];
		}
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", userIdentity.email))
			.unique();
		if (!user) {
			return [];
		}
		const questions = await ctx.db
			.query("questions")
			.withIndex("by_author", (q) => q.eq("authorId", user._id))
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.collect();
		return questions;
	},
});

export const getLikedQuestions = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return [];
		}

		const likedUserQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();

		if (likedUserQuestions.length === 0) {
			return [];
		}

		const questions = await Promise.all(
			likedUserQuestions.map((uq) => ctx.db.get(uq.questionId))
		);

		return questions
			.filter((q): q is Doc<"questions"> => q !== null)
			.filter((q) => q.organizationId === args.organizationId);
	},
});

export const getQuestionById = query({
	args: {
		id: v.string(),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args) => {
		if (!args.id) return null;
		try {
			const questionId = ctx.db.normalizeId("questions", args.id);
			if (!questionId) return null;
			return await ctx.db.get(questionId);
		} catch {
			return null;
		}
	},
});

export const getQuestion = query({
	args: {
		id: v.id("questions"),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args) => {
		const question = await ctx.db.get(args.id);
		if (!question) return null;
		const { embedding, ...questionData } = question;
		return questionData;
	},
});

export const getQuestionForOgImage = query({
	args: {
		id: v.id("questions"),
	},
	returns: v.union(
		v.object({
			text: v.optional(v.string()),
			styleName: v.string(),
			styleColor: v.string(),
			styleIcon: v.string(),
			toneName: v.string(),
			toneColor: v.string(),
			toneIcon: v.string(),
			gradientStart: v.string(),
			gradientEnd: v.string(),
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const question = await ctx.db.get(args.id);
		if (!question) return null;

		let styleDoc = null;
		if (question.style) {
			styleDoc = await ctx.db.query("styles").withIndex("by_my_id", (q) => q.eq("id", question.style!)).unique();
		}

		let toneDoc = null;
		if (question.tone) {
			toneDoc = await ctx.db.query("tones").withIndex("by_my_id", (q) => q.eq("id", question.tone!)).unique();
		}

		return {
			text: question.text || question.customText,
			styleName: styleDoc?.name || "General",
			styleColor: styleDoc?.color || "#000000",
			styleIcon: styleDoc?.icon || "CircleQuestionMark",
			toneName: toneDoc?.name || "Casual",
			toneColor: toneDoc?.color || "#000000",
			toneIcon: toneDoc?.icon || "CircleQuestionMark",
			gradientStart: styleDoc?.color || "#f0f0f0",
			gradientEnd: toneDoc?.color || "#d0d0d0",
		};
	},
});

// Save the generated AI question to the database
export const saveAIQuestion = mutation({
	args: {
		text: v.string(),
		tags: v.array(v.string()),
		style: v.optional(v.string()),
		styleId: v.id("styles"),
		tone: v.optional(v.string()),
		toneId: v.id("tones"),
		topic: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args) => {
		const { text, tags, style, tone, topic, topicId } = args;

		// Check if a question with the same text already exists
		const existingQuestion = await ctx.db
			.query("questions")
			.withIndex("by_text", (q) => q.eq("text", text))
			.first();

		if (existingQuestion) {
			return null;
		}

		const id = await ctx.db.insert("questions", {
			text,
			tags,
			style,
			styleId: args.styleId,
			tone,
			toneId: args.toneId,
			topic,
			topicId,
			status: "public",
			isAIGenerated: true,
			lastShownAt: 0,
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
		await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
			questionId: id,
		});
		return await ctx.db.get(id);
	},
});

export const addCustomQuestion = mutation({
	args: {
		customText: v.string(),
		isPublic: v.boolean(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to add a custom question.");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			throw new Error("User not found.");
		}

		const { customText, isPublic } = args;
		if (customText.trim().length === 0) {
			return;
		}
		return await ctx.db.insert("questions", {
			authorId: user._id,
			customText,
			status: isPublic ? "pending" : "private",
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
	},
});

export const makeQuestionPublic = mutation({
	args: {
		questionId: v.id("questions"),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to update a question.");
		}
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();
		if (!user) {
			throw new Error("User not found.");
		}
		const question = await ctx.db.get(args.questionId);
		if (!question) {
			throw new Error("Question not found.");
		}
		if (question.authorId !== user._id) {
			throw new Error("You are not authorized to update this question.");
		}
		if (question.status !== "private") {
			throw new Error("Only private questions can be made public.");
		}
		await ctx.db.patch(args.questionId, {
			status: "pending",
		});
	},
});

export const getNearestQuestionsByEmbedding = action({
	args: {
		embedding: v.array(v.number()),
		style: v.optional(v.string()),
		tone: v.optional(v.string()),
		count: v.optional(v.number()),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		return await getNearestQuestionsByEmbeddingInternal(ctx, args);
	},
});

export const getNextQuestionsByEmbedding = action({
	args: {
		style: v.optional(v.string()),
		tone: v.optional(v.string()),
		count: v.optional(v.number()),
		userId: v.optional(v.id("users")),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<any[]> => {
		const { style, tone, count, userId } = args;
		if (!userId) {
			return [];
		}
		const user: Doc<"users"> | null = await ctx.runQuery(internal.internal.users.getUserById, {
			id: userId,
		});
		if (!user) {
			return [];
		}
		const embedding = await embed(style + " " + tone);
		if (!embedding) {
			return [];
		}
		const averageEmbedding = calculateAverageEmbedding([embedding, user.questionPreferenceEmbedding ?? []] as number[][]);

		// Use the helper instead of calling the action to avoid action-to-action chaining
		return await getNearestQuestionsByEmbeddingInternal(ctx, {
			embedding: averageEmbedding,
			count: count,
		});
	},
});
