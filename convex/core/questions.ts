import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
	mutation,
	query,
	action,
	ActionCtx,
	MutationCtx,
	internalQuery,
} from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import {
	ensureAdmin,
	ensurePaidOrganizationMember,
} from "../auth";
import { calculateAverageEmbedding } from "../lib/embeddings";
import { fingerprintText } from "../lib/promptArchitecture";
import { findCanonicalUser } from "../lib/users";
import { canReadQuestion, isQuestionPublic, isReadableByLink, isRetiredQuestion } from "../lib/questionAccess";
import { resolveTaxonomySlug } from "../lib/taxonomyLookup";
import { removeQuestionReferences } from "../lib/questionReferences";
import { ensureAiRequestAllowed } from "../lib/aiRateLimit";
import { wasAiCallBilled } from "../lib/aiSpendGuard";
import { requireQuestionText } from "../lib/questionText";
import { normalizeQuestionTags } from "../lib/questionTags";
import { shownWording, syncReviewedEmbedding } from "../lib/questionReview";
import { editorialReason } from "../lib/questionReviewValidators";
import { claudeFlag } from "../lib/qualityCheck";
import { ConvexError } from "convex/values";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";

const MAX_REMIX_QUESTION_CHARS = 1_000;

export const addPersonalQuestion = mutation({
	args: {
		customText: v.string(),
		isPublic: v.boolean(),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
		topicId: v.optional(v.id("topics")),
		tags: v.optional(v.array(v.string())),
		organizationId: v.optional(v.id("organizations")),
	},
	returns: v.union(v.id("questions"), v.null()),
	handler: async (ctx, args) => {
		if (args.organizationId) {
			await ensurePaidOrganizationMember(ctx, args.organizationId);
		}
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to add a personal question.");
		}
		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});
		if (!user) throw new Error("User not found.");

		const { isPublic, styleId, toneId } = args;
		if (args.customText.trim().length === 0) {
			// do not save empty questions
			return null;
		}
		const customText = requireQuestionText(args.customText);
		const tags = normalizeQuestionTags(args.tags);

		// Look up slugs for legacy support
		const [styleDoc, toneDoc, topicDoc] = await Promise.all([
			styleId ? ctx.db.get(styleId) : null,
			toneId ? ctx.db.get(toneId) : null,
			args.topicId ? ctx.db.get(args.topicId) : null,
		]);

		return await ctx.db.insert("questions", {
			authorId: user._id,
			customText,
			status: isPublic ? "pending" : "private",
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
			styleId,
			style: styleDoc?.id,
			toneId,
			tone: toneDoc?.id,
			topicId: args.topicId,
			topic: topicDoc?.id,
			tags,
			organizationId: args.organizationId,
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

/**
 * Shared logic for getting random questions.
 * Extracted into a helper to avoid action-to-action chaining.
 */
async function getNextRandomQuestionsInternal(
	ctx: ActionCtx,
	args: {
		count: number;
		seen?: Id<"questions">[];
		hidden?: Id<"questions">[];
		hiddenStyles?: Id<"styles">[];
		hiddenTones?: Id<"tones">[];
		organizationId?: Id<"organizations">;
		randomSeed?: number;
		anchoredStyleId?: Id<"styles">;
		anchoredToneId?: Id<"tones">;
		anchoredTopicId?: Id<"topics">;
	}
): Promise<{
	questions: any[];
	anchoredMatchCount: number;
	targetAnchoredCount: number;
}> {
	const {
		count,
		seen = [],
		hidden = [],
		hiddenStyles = [],
		hiddenTones = [],
		organizationId,
		randomSeed = Math.random(),
		anchoredStyleId,
		anchoredToneId,
		anchoredTopicId
	} = args;

	if (anchoredStyleId || anchoredToneId || anchoredTopicId) {
		return await ctx.runQuery(internal.internal.questions.getAnchoredQuestionsInternal, {
			count,
			seen,
			hidden,
			hiddenStyles,
			hiddenTones,
			organizationId,
			anchoredStyleId,
			anchoredToneId,
			anchoredTopicId,
			randomSeed,
			currentTime: Date.now(),
		});
	}

	// Fetch and shuffle the unanchored feed candidate pool.
	const candidates = await ctx.runQuery(internal.internal.questions.getRandomQuestionsInternal, {
		count,
		seen,
		hidden,
		hiddenStyles,
		hiddenTones,
		organizationId,
		anchoredStyleId,
		anchoredToneId,
		anchoredTopicId,
	});

	const results = [...candidates];
	shuffleArray(results, randomSeed);

	return {
		questions: results.slice(0, count),
		anchoredMatchCount: 0,
		targetAnchoredCount: 0,
	};
}

export const getNextRandomQuestions = action({
	args: {
		count: v.float64(),
		seen: v.optional(v.array(v.id("questions"))),
		hidden: v.optional(v.array(v.id("questions"))),
		hiddenStyles: v.optional(v.array(v.id("styles"))),
		hiddenTones: v.optional(v.array(v.id("tones"))),
		organizationId: v.optional(v.id("organizations")),
		randomSeed: v.optional(v.float64()),
		anchoredStyleId: v.optional(v.id("styles")),
		anchoredToneId: v.optional(v.id("tones")),
		anchoredTopicId: v.optional(v.id("topics")),
	},
	returns: v.object({
		questions: v.array(v.any()),
		anchoredMatchCount: v.number(),
		targetAnchoredCount: v.number(),
	}),
	handler: async (ctx, args) => {
		return await getNextRandomQuestionsInternal(ctx, args);
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

		const candidates = await ctx.db
			.query("questions")
			.withIndex("by_style_and_tone", (q) => q.eq("styleId", style).eq("toneId", tone))
			.filter((q) => q.eq(q.field("organizationId"), organizationId))
			.filter((q) => q.and(
				q.neq(q.field("text"), undefined),
				q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined))
			))
			.filter((q) => q.and(... (hidden ?? []).map(hiddenId => q.neq(q.field("_id"), hiddenId))))
			.filter((q) => q.and(... (seen ?? []).map(seenId => q.neq(q.field("_id"), seenId))))
			.collect();
		// Retirement is checked in code so the rule stays in one place (see isRetiredQuestion);
		// collect reads the whole index range either way.
		const filteredQuestions = candidates.filter((question) => !isRetiredQuestion(question));

		const unseenQuestions = filteredQuestions.filter(q => !seenIds.has(q._id));
		if (unseenQuestions.length > 0) {
			shuffleArray(unseenQuestions);
			return unseenQuestions.slice(0, count);
		}

		shuffleArray(filteredQuestions);
		return filteredQuestions.slice(0, count);
	}
})

const MAX_VIEW_DURATION_MS = 10 * 60 * 1000;
// Client session ids are UUIDs; a longer string is not one, and it would be stored and indexed.
const MAX_SESSION_ID_LENGTH = 64;
// Anonymous likes on one question are capped per window: a caller can mint a new session
// id per like, so the per-session check alone does not bound them.
const ANONYMOUS_LIKE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ANONYMOUS_LIKES_PER_WINDOW = 20;

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
		const { questionId, event } = args;
		const sessionId =
			args.sessionId && args.sessionId.length <= MAX_SESSION_ID_LENGTH ? args.sessionId : undefined;
		const question = await ctx.db.get(questionId);
		if (!question) return null;

		const identity = await ctx.auth.getUserIdentity();
		const user = identity
			? await findCanonicalUser(ctx, {
				clerkId: identity.subject,
				tokenIdentifier: identity.tokenIdentifier,
				email: identity.email,
			})
			: null;
		const userId = user?._id ?? null;

		// An event on a question this caller cannot see would create a like or history
		// link that later returns the question to them, so ignore it.
		if (!(await canReadQuestion(ctx, question, userId ?? undefined))) return null;

		// The duration is reported by the client; bound it so one call cannot skew the average.
		const viewDuration = Number.isFinite(args.viewDuration)
			? Math.min(Math.max(args.viewDuration, 0), MAX_VIEW_DURATION_MS)
			: 0;

		// A like counts once per signed-in user, or once per anonymous session. Checked
		// against earlier like events, not the liked list: the client updates the list
		// just before sending this event.
		let countLike = false;
		if (event === "liked") {
			if (userId) {
				const priorLike = await ctx.db
					.query("analytics")
					.withIndex("by_userId_questionId_event", (q) =>
						q.eq("userId", userId).eq("questionId", questionId).eq("event", "liked"),
					)
					.first();
				countLike = priorLike === null;
			} else if (sessionId) {
				const priorLike = await ctx.db
					.query("analytics")
					.withIndex("by_sessionId_questionId_event", (q) =>
						q.eq("sessionId", sessionId).eq("questionId", questionId).eq("event", "liked"),
					)
					.first();
				if (priorLike === null) {
					const recentAnonymousLikes = await ctx.db
						.query("analytics")
						.withIndex("by_questionId_event_timestamp", (q) =>
							q
								.eq("questionId", questionId)
								.eq("event", "liked")
								.gte("timestamp", Date.now() - ANONYMOUS_LIKE_WINDOW_MS),
						)
						.filter((q) => q.eq(q.field("userId"), undefined))
						.take(MAX_ANONYMOUS_LIKES_PER_WINDOW);
					countLike = recentAnonymousLikes.length < MAX_ANONYMOUS_LIKES_PER_WINDOW;
				}
			}
		}

		// A like that doesn't count changes nothing else either: no event row (the admin
		// like count and rate read these) and no extra show in the pruning stats.
		if (event === "liked" && !countLike) return null;

		await ctx.db.insert("analytics", {
			questionId,
			event,
			viewDuration,
			timestamp: Date.now(),
			userId: userId ?? undefined,
			// Signed-in events are tied to the user; storing the device's session id too
			// would link the account to anyone's signed-out activity on that device.
			sessionId: userId ? undefined : sessionId,
		});

		if (countLike) {
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
					q.eq("userId", userId).eq("questionId", questionId)
				)
				.first();

			if (userQuestion) {
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

		const identity = await ctx.auth.getUserIdentity();
		const user = identity
			? await findCanonicalUser(ctx, {
				clerkId: identity.subject,
				tokenIdentifier: identity.tokenIdentifier,
				email: identity.email,
			})
			: null;

		const questions = await Promise.all(
			validIds.map((id) => ctx.db.get(id))
		);
		const visibleQuestions: Doc<"questions">[] = [];
		for (const question of questions) {
			if (!question) continue;
			if (await canReadQuestion(ctx, question, user?._id)) {
				visibleQuestions.push(question);
			}
		}
		return visibleQuestions;
	},
});

/** List public/approved questions that orgs can assign to schedules */
export const getPublicQuestions = query({
	args: {
		limit: v.optional(v.number()),
		generationKey: v.optional(v.number()),
	},
	returns: v.array(v.object({
		_id: v.id("questions"),
		text: v.optional(v.string()),
		style: v.optional(v.string()),
		tone: v.optional(v.string()),
		topic: v.optional(v.string()),
		isAIGenerated: v.optional(v.boolean()),
		totalLikes: v.number(),
		status: v.optional(v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("public"),
			v.literal("private"),
			v.literal("pruning"),
			v.literal("pruned")
		)),
		// Present only when the quality check held the question or raised a safety concern,
		// and no admin has reviewed it since: its reasons, safety flags and one-sentence
		// note, for whoever is choosing questions for a team.
		claudeFlag: v.optional(v.object({
			reasons: v.array(editorialReason),
			safety: v.array(v.string()),
			note: v.string(),
		})),
	})),
	handler: async (ctx, args) => {
		const limit = args.limit ?? 200;
		const [pubRows, apprRows, legacyRows] = await Promise.all([
			ctx.db
				.query("questions")
				.withIndex("by_status", (q) => q.eq("status", "public"))
				.take(limit),
			ctx.db
				.query("questions")
				.withIndex("by_status", (q) => q.eq("status", "approved"))
				.take(limit),
			ctx.db
				.query("questions")
				.withIndex("by_status", (q) => q.eq("status", undefined))
				.take(limit),
		]);
		const byId = new Map<Id<"questions">, Doc<"questions">>();
		for (const q of pubRows) {
			byId.set(q._id, q);
		}
		for (const q of apprRows) {
			byId.set(q._id, q);
		}
		for (const q of legacyRows) {
			byId.set(q._id, q);
		}
		// Older pruning set only prunedAt and left the status, so retirement is checked here too
		// (see isRetiredQuestion): assignQuestion refuses a retired library question.
		const merged = [...byId.values()]
			.filter((q) => !isRetiredQuestion(q))
			.sort((a, b) => a._creationTime - b._creationTime);
		const rows = merged.slice(0, limit);
		return rows.map((q) => ({
			_id: q._id,
			text: q.text ?? q.customText,
			style: q.style,
			tone: q.tone,
			topic: q.topic,
			isAIGenerated: q.isAIGenerated,
			totalLikes: q.totalLikes,
			status: q.status,
			claudeFlag: claudeFlag(q),
		}));
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
		const userEmb = await ctx.db
			.query("user_embeddings")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.first();
		const likedQuestionIds = await ctx.db
			.query("userQuestions")
			.withIndex("by_userId_status_updatedAt", (q) =>
				q.eq("userId", user._id).eq("status", "liked")
			)
			.collect();
		const questionEmbeddings = await Promise.all(
			likedQuestionIds.map((uq) =>
				ctx.db
					.query("question_embeddings")
					.withIndex("by_questionId", (q) => q.eq("questionId", uq.questionId))
					.first()
			)
		);
		const embeddings = questionEmbeddings
			.filter((e): e is NonNullable<typeof e> => e != null)
			.map((e) => e.embedding);
		const toAverage: number[][] = [...embeddings];
		if (userEmb?.embedding && userEmb.embedding.length > 0) {
			toAverage.push(userEmb.embedding);
		}
		const results = calculateAverageEmbedding(toAverage);
		return results;
	},
});

export const getCustomQuestions = query({
	args: {
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		if (args.organizationId) {
			await ensurePaidOrganizationMember(ctx, args.organizationId);
		}
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
		return questions.filter((question) => question.kind !== "team_prompt");
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

		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

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

		const liked: Doc<"questions">[] = [];
		for (const question of questions) {
			if (!question || question.organizationId !== args.organizationId) continue;
			if (await canReadQuestion(ctx, question, user._id)) liked.push(question);
		}
		return liked;
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
			const question = await ctx.db.get(questionId);
			if (!question) return null;
			const identity = await ctx.auth.getUserIdentity();
			const user = identity
				? await findCanonicalUser(ctx, {
					clerkId: identity.subject,
					tokenIdentifier: identity.tokenIdentifier,
					email: identity.email,
				})
				: null;
			return (await canReadQuestion(ctx, question, user?._id)) ? question : null;
		} catch {
			return null;
		}
	},
});

export const getQuestionImageUrl = query({
	args: { questionId: v.id("questions") },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const question = await ctx.db.get(args.questionId);
		if (!question?.imageStorageId) return null;
		if (!isReadableByLink(question)) return null;
		return await ctx.storage.getUrl(question.imageStorageId);
	},
});

export const getQuestionForOgImage = query({
	args: {
		id: v.string(),
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
			imageUrl: v.optional(v.string()),
			// Held for review: callers must not cache or index it, since it may yet be rejected.
			heldForReview: v.boolean(),
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const questionId = ctx.db.normalizeId("questions", args.id);
		if (!questionId) {
			console.log(`Normalization failed for ID: ${args.id}`);
			return null;
		}
		const question = await ctx.db.get(questionId);
		if (!question) {
			console.log(`Question not found in DB for normalized ID: ${questionId}`);
			return null;
		}
		// The daily email embeds this image, and its question may still be held for review.
		if (!isReadableByLink(question)) return null;

		const styleDoc = question.style
			? await resolveTaxonomySlug(ctx.db, "styles", question.style, question.organizationId)
			: null;
		const toneDoc = question.tone
			? await resolveTaxonomySlug(ctx.db, "tones", question.tone, question.organizationId)
			: null;

		const imageUrl =
			question.imageStorageId
				? await ctx.storage.getUrl(question.imageStorageId)
				: undefined;

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
			imageUrl: imageUrl ?? undefined,
			heldForReview: !isQuestionPublic(question),
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
		styleSlug: v.optional(v.string()),
		toneSlug: v.optional(v.string()),
		topicSlug: v.optional(v.string()),
		styleVersion: v.optional(v.number()),
		toneVersion: v.optional(v.number()),
		topicVersion: v.optional(v.number()),
		generationRunId: v.optional(v.id("generationRuns")),
		source: v.optional(v.union(v.literal("ai"), v.literal("seed"), v.literal("editor"))),
		moderationNotes: v.optional(v.string()),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { text, tags, style, tone, topic, topicId } = args;
		const fingerprint = fingerprintText(text);

		const existingQuestion = await ctx.db
			.query("questions")
			.withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
			.first();

		if (existingQuestion) {
			return null;
		}

		const id = await ctx.db.insert("questions", {
			text,
			fingerprint,
			tags,
			style,
			styleId: args.styleId,
			tone,
			toneId: args.toneId,
			topic,
			topicId,
			styleSlug: args.styleSlug ?? style,
			toneSlug: args.toneSlug ?? tone,
			topicSlug: args.topicSlug ?? topic,
			styleVersion: args.styleVersion,
			toneVersion: args.toneVersion,
			topicVersion: args.topicVersion,
			generationRunId: args.generationRunId,
			source: args.source ?? "ai",
			safetyFlags: [],
			moderationNotes: args.moderationNotes,
			quality: {},
			status: "public",
			isAIGenerated: true,
			lastShownAt: 0,
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
		if (args.generationRunId) {
			const run = await ctx.db.get(args.generationRunId);
			if (run) {
				const safeResultQuestionIds = Array.isArray(run.resultQuestionIds)
					? run.resultQuestionIds
					: [];
				const resultQuestionIds = safeResultQuestionIds.includes(id)
					? safeResultQuestionIds
					: [...safeResultQuestionIds, id];
				await ctx.db.patch(args.generationRunId, {
					acceptedQuestionId: id,
					resultQuestionIds,
				});
			}
		}
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
		organizationId: v.optional(v.id("organizations")),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to add a custom question.");
		}

		if (args.organizationId) {
			await ensurePaidOrganizationMember(ctx, args.organizationId);
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			throw new Error("User not found.");
		}

		const { isPublic, organizationId } = args;
		if (args.customText.trim().length === 0) {
			return;
		}
		const customText = requireQuestionText(args.customText);
		return await ctx.db.insert("questions", {
			authorId: user._id,
			customText,
			status: isPublic ? "pending" : "private",
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
			organizationId,
		});
	},
});

// Remix a question for a regular user (returns the remixed text, does NOT modify the original)
export const remixQuestionForUser = action({
	args: {
		questionId: v.id("questions"),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
		topicId: v.optional(v.id("topics")),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to remix a question.");
		}
		// Before anything else, including the takeover check that skips the usage quota.
		await ensureAiRequestAllowed(ctx);

		// Same user lookup as getQuestionById below, so usage and visibility agree on who is asking.
		const user: Doc<"users"> | null = await ctx.runQuery(api.core.users.getCurrentUser, {});

		if (!user) {
			throw new Error("User not found.");
		}

		// The public query applies this caller's visibility, so another user's private
		// question reads as not found instead of being sent to the model.
		const question: Doc<"questions"> | null = await ctx.runQuery(api.core.questions.getQuestionById, {
			id: args.questionId,
		});
		if (!question) {
			throw new Error("Question not found.");
		}
		// The whole question goes into the prompt. Admin-written text and questions saved before the
		// length limit on user-written text can be longer.
		if ((question.text ?? question.customText ?? "").length > MAX_REMIX_QUESTION_CHARS) {
			throw new ConvexError({ code: ERROR_CODES.AI_PROMPT_TOO_LARGE, message: ERROR_MESSAGES.AI_REMIX_TOO_LONG });
		}

		// Bill the question's org only for its members, as generateAIQuestionForFeed does.
		// Anyone else is charged personally, so a public gym question isn't a fresh allowance.
		let usageOrganizationId: Id<"organizations"> | undefined;
		if (question.organizationId) {
			const organizations = await ctx.runQuery(api.core.organizations.getOrganizations, {});
			if (organizations.some((organization: { _id: Id<"organizations"> }) => organization._id === question.organizationId)) {
				usageOrganizationId = question.organizationId;
			}
		}

		const topicIdToUse = args.topicId || question.topicId;
		const takeoverTopics = await ctx.runQuery(api.core.topics.getActiveTakeoverTopics);
		const isTakeover = takeoverTopics.some((t: { _id: Id<"topics"> }) => t._id === topicIdToUse);

		let usageIncremented = false;
		try {
			if (!isTakeover) {
				await ctx.runMutation(internal.internal.users.checkAndIncrementAIUsage, {
					userId: user._id,
					organizationId: usageOrganizationId,
				});
				usageIncremented = true;
			}

			const questionText = question.text ?? question.customText;

			if (!questionText) {
				throw new Error("Question text not found.");
			}
			const remixText = await ctx.runAction(internal.internal.ai.remixQuestionFull, {
				questionText,
				styleId: args.styleId,
				toneId: args.toneId,
				topicId: args.topicId,
			});

			return remixText;
		} catch (error) {
			// Refund unless an answer was paid for. A call that timed out is refunded too: its
			// reservation stays on the daily budget, but the person got nothing.
			if (usageIncremented && !wasAiCallBilled(error)) {
				// Refund the same counter the charge above used.
				await ctx.runMutation(internal.internal.users.decrementAIUsage, {
					userId: user._id,
					organizationId: usageOrganizationId,
				});
			}
			throw error;
		}
	},
});

function assertPersonalQuestionLifecycle(question: Doc<"questions">) {
	if (question.kind === "team_prompt") {
		throw new Error("This is a schedule-managed Team prompt, not a personal question.");
	}
}

// A copy retired as a duplicate stays as it was resolved: admins undo the resolution
// before changing its status, and its author can't edit it either.
function assertNotMergedDuplicate(question: Doc<"questions">) {
	if (question.duplicateOf) {
		throw new ConvexError({
			code: ERROR_CODES.QUESTION_MERGED_AS_DUPLICATE,
			message: ERROR_MESSAGES.QUESTION_MERGED_AS_DUPLICATE,
		});
	}
}

// Copies retired as duplicates of this question point at it, so only an admin changes or
// removes it.
async function assertNoMergedCopies(ctx: MutationCtx, question: Doc<"questions">) {
	const mergedCopy = await ctx.db
		.query("questions")
		.withIndex("by_duplicateOf", (q) => q.eq("duplicateOf", question._id))
		.first();
	if (mergedCopy) {
		throw new ConvexError({
			code: ERROR_CODES.QUESTION_HAS_MERGED_COPIES,
			message: ERROR_MESSAGES.QUESTION_HAS_MERGED_COPIES,
		});
	}
}

// Update a personal question (must be owned by the current user)
export const updatePersonalQuestion = mutation({
	args: {
		questionId: v.id("questions"),
		customText: v.string(),
		isPublic: v.boolean(),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
		topicId: v.optional(v.id("topics")),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to update a personal question.");
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
		if (question.organizationId) {
			await ensurePaidOrganizationMember(ctx, question.organizationId);
		}
		if (question.authorId !== user._id) {
			throw new Error("You are not authorized to update this question.");
		}
		assertPersonalQuestionLifecycle(question);
		assertNotMergedDuplicate(question);
		await assertNoMergedCopies(ctx, question);
		const customText = requireQuestionText(args.customText);
		const tags = normalizeQuestionTags(args.tags);
		// Look up slugs for legacy support
		const [styleDoc, toneDoc, topicDoc] = await Promise.all([
			args.styleId ? ctx.db.get(args.styleId) : null,
			args.toneId ? ctx.db.get(args.toneId) : null,
			args.topicId ? ctx.db.get(args.topicId) : null,
		]);

		// A question approved without reviewed text shows its customText. Keep that approved
		// wording as the reviewed text before the author's edit replaces customText.
		const approvedWording =
			question.text === undefined && isQuestionPublic(question) ? question.customText : undefined;
		await ctx.db.patch(args.questionId, {
			// The author edits their own wording. Reviewed text stays as it is, so views keep
			// showing the reviewed wording.
			...(approvedWording !== undefined ? { text: approvedWording } : {}),
			customText,
			status: args.isPublic ? "pending" : "private",
			// An edit to a pruned question sends it back through review too, so it is no longer
			// retired (see isRetiredQuestion). Undoing the prune is refused once it is edited.
			prunedAt: undefined,
			// Pending or private, so not a library question: it keeps no fingerprint (see isPrivateUserQuestion).
			fingerprint: undefined,
			// Author edits go back through review: an earlier review can't be undone over
			// them, and a review started before them has to reload.
			reviewRevision: (question.reviewRevision ?? 0) + 1,
			styleId: args.styleId,
			style: styleDoc?.id,
			toneId: args.toneId,
			tone: toneDoc?.id,
			topicId: args.topicId,
			topic: topicDoc?.id,
			tags,
		});
		// Now pending or private, so this only drops its embedding. It is embedded again once a
		// review makes it public.
		await syncReviewedEmbedding(ctx, (await ctx.db.get(args.questionId))!, shownWording(question));
		await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
			questionId: args.questionId,
		});
		return await ctx.db.get(args.questionId);
	},
});

// Delete a personal question (must be owned by the current user)
export const deletePersonalQuestion = mutation({
	args: {
		questionId: v.id("questions"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("You must be logged in to delete a question.");
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
		if (question.organizationId) {
			await ensurePaidOrganizationMember(ctx, question.organizationId);
		}
		if (question.authorId !== user._id) {
			throw new Error("You are not authorized to delete this question.");
		}
		assertPersonalQuestionLifecycle(question);
		await assertNoMergedCopies(ctx, question);
		await removeQuestionReferences(ctx, args.questionId);
		await ctx.db.delete(args.questionId);
		return null;
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
		if (question.organizationId) {
			await ensurePaidOrganizationMember(ctx, question.organizationId);
		}
		if (question.authorId !== user._id) {
			throw new Error("You are not authorized to update this question.");
		}
		assertPersonalQuestionLifecycle(question);
		assertNotMergedDuplicate(question);
		await assertNoMergedCopies(ctx, question);
		if (question.status !== "private") {
			throw new Error("Only private questions can be made public.");
		}
		await ctx.db.patch(args.questionId, {
			status: "pending",
			reviewRevision: (question.reviewRevision ?? 0) + 1,
		});
		await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
			questionId: args.questionId,
		});
	},
});

const matrixAxisValidator = v.union(
	v.literal("style"),
	v.literal("tone"),
	v.literal("topic"),
);

/** Paginate questions by status and emit matrix cell keys for occupancy checks (fill matrix). */
export const pageQuestionMatrixCellKeys = internalQuery({
	args: {
		status: v.union(v.literal("public"), v.literal("approved"), v.null()),
		axisY: matrixAxisValidator,
		axisX: matrixAxisValidator,
		topicSlug: v.optional(v.string()),
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object({
		keys: v.array(v.string()),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const statusFilter = args.status === null ? undefined : args.status;
		const r = await ctx.db
			.query("questions")
			.withIndex("by_status", (q) => q.eq("status", statusFilter))
			.order("asc")
			.paginate(args.paginationOpts);
		const keys: string[] = [];
		for (const q of r.page) {
			const y =
				args.axisY === "style"
					? q.style
					: args.axisY === "tone"
						? q.tone
						: q.topic;
			const x =
				args.axisX === "style"
					? q.style
					: args.axisX === "tone"
						? q.tone
						: q.topic;
			if (y == null || x == null || y === "" || x === "") {
				continue;
			}
			if (
				args.topicSlug !== undefined &&
				args.topicSlug !== "" &&
				(q.topic ?? "") !== args.topicSlug
			) {
				continue;
			}
			keys.push(`${y}|${x}`);
		}
		return {
			keys,
			isDone: r.isDone,
			continueCursor: r.continueCursor,
		};
	},
});

/** Paginate until we find a question matching style/tone/topic slugs (public or approved). */
export const pageQuestionsMatchingSlugTriple = internalQuery({
	args: {
		status: v.union(v.literal("public"), v.literal("approved"), v.null()),
		styleSlug: v.string(),
		toneSlug: v.string(),
		topicSlug: v.optional(v.string()),
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object({
		found: v.boolean(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const statusFilter = args.status === null ? undefined : args.status;
		const r = await ctx.db
			.query("questions")
			.withIndex("by_status", (q) => q.eq("status", statusFilter))
			.order("asc")
			.paginate(args.paginationOpts);
		const found = r.page.some(
			(q) =>
				(q.style ?? "") === args.styleSlug &&
				(q.tone ?? "") === args.toneSlug &&
				(args.topicSlug == null || (q.topic ?? "") === args.topicSlug),
		);
		return {
			found,
			isDone: r.isDone,
			continueCursor: r.continueCursor,
		};
	},
});
