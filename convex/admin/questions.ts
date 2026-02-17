import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ensureAdmin } from "../auth";
import { internal } from "../_generated/api";

async function getOldestQuestion(ctx: any) {
	return await ctx.db
		.query("questions")
		.withIndex("by_creation_time")
		.order("asc")
		.first();
}

export const getQuestions = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		return await ctx.db
			.query("questions")
			.withIndex("by_creation_time")
			.order("desc")
			.take(100);
	},
});

// Create a new question (admin only)
export const createQuestion = mutation({
	args: {
		text: v.string(),
		tags: v.optional(v.array(v.string())),
		style: v.optional(v.string()),
		tone: v.optional(v.string()),
		status: v.optional(v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("public"),
			v.literal("private"),
			v.literal("pruning"),
			v.literal("pruned")
		)),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
	},
	returns: v.id("questions"),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		let styleId = args.styleId;
		if (args.style && !styleId) {
			const styleDoc = await ctx.db.query("styles").withIndex("by_my_id", q => q.eq("id", args.style!)).unique();
			if (styleDoc) styleId = styleDoc._id;
		}

		let toneId = args.toneId;
		if (args.tone && !toneId) {
			const toneDoc = await ctx.db.query("tones").withIndex("by_my_id", q => q.eq("id", args.tone!)).unique();
			if (toneDoc) toneId = toneDoc._id;
		}

		return await ctx.db.insert("questions", {
			text: args.text,
			tags: args.tags ?? [],
			style: args.style ?? undefined,
			styleId: styleId ?? undefined,
			tone: args.tone ?? undefined,
			toneId: toneId ?? undefined,
			status: args.status ?? "pending",
			totalLikes: 0,
			totalThumbsDown: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
	},
});

export const updateQuestion = mutation({
	args: {
		id: v.id("questions"),
		text: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		style: v.optional(v.string()),
		tone: v.optional(v.string()),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
		topic: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
		status: v.optional(v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("public"),
			v.literal("private"),
			v.literal("pruning"),
			v.literal("pruned")
		)),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const { id, text, tags, style, tone, status, styleId, toneId, topic, topicId } = args;

		const updateData: any = {};

		if (text !== undefined) {
			updateData.text = text;
		}

		if (tags !== undefined) {
			updateData.tags = tags;
		}

		if (style !== undefined) {
			updateData.style = style;
			if (!styleId) {
				const styleDoc = await ctx.db.query("styles").withIndex("by_my_id", q => q.eq("id", style)).unique();
				if (styleDoc) updateData.styleId = styleDoc._id;
			}
		}

		if (styleId !== undefined) {
			updateData.styleId = styleId;
		}

		if (tone !== undefined) {
			updateData.tone = tone;
			if (!toneId) {
				const toneDoc = await ctx.db.query("tones").withIndex("by_my_id", q => q.eq("id", tone)).unique();
				if (toneDoc) updateData.toneId = toneDoc._id;
			}
		}

		if (toneId !== undefined) {
			updateData.toneId = toneId;
		}

		if (topic !== undefined) {
			updateData.topic = topic;
			if (!topicId) {
				const topicDoc = await ctx.db.query("topics").withIndex("by_my_id", q => q.eq("id", topic)).unique();
				if (topicDoc) updateData.topicId = topicDoc._id;
			}
		}

		if (topicId !== undefined) {
			updateData.topicId = topicId;
		}

		if (status !== undefined) {
			updateData.status = status;
		}

		await ctx.db.patch(id, updateData);
		if (status !== undefined || styleId !== undefined || toneId !== undefined) {
			await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, {
				questionId: id,
			});
		}
		return null;
	},
});

// Get a single question by ID with resolved style/tone/topic for the admin detail page
export const getQuestionById = query({
	args: { id: v.id("questions") },
	returns: v.any(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const question = await ctx.db.get(args.id);
		if (!question) return null;

		const [styleDoc, toneDoc, topicDoc] = await Promise.all([
			question.styleId ? ctx.db.get(question.styleId) : null,
			question.toneId ? ctx.db.get(question.toneId) : null,
			question.topicId ? ctx.db.get(question.topicId) : null,
		]);

		return {
			...question,
			_style: styleDoc ? { _id: styleDoc._id, id: styleDoc.id, name: styleDoc.name, icon: styleDoc.icon, color: styleDoc.color } : null,
			_tone: toneDoc ? { _id: toneDoc._id, id: toneDoc.id, name: toneDoc.name, icon: toneDoc.icon, color: toneDoc.color } : null,
			_topic: topicDoc ? { _id: topicDoc._id, id: topicDoc.id, name: topicDoc.name, description: topicDoc.description } : null,
		};
	},
});

// Get analytics for a single question
export const getQuestionAnalytics = query({
	args: { questionId: v.id("questions") },
	returns: v.any(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const events = await ctx.db
			.query("analytics")
			.withIndex("by_questionId_event_timestamp", (q) => q.eq("questionId", args.questionId))
			.collect();

		// Count events by type
		const seenEvents = events.filter(e => e.event === "seen");
		const likedEvents = events.filter(e => e.event === "liked");
		const sharedEvents = events.filter(e => e.event === "shared");
		const hiddenEvents = events.filter(e => e.event === "hidden");

		// View duration stats
		const durations = seenEvents.map(e => e.viewDuration).filter(d => d > 0);
		const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
		const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

		// Daily breakdown for last 30 days
		const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
		const recentEvents = events.filter(e => e.timestamp >= thirtyDaysAgo);

		const dailyMap = new Map<string, { seen: number; liked: number; shared: number; hidden: number }>();
		for (const e of recentEvents) {
			const day = new Date(e.timestamp).toISOString().split('T')[0];
			if (!dailyMap.has(day)) {
				dailyMap.set(day, { seen: 0, liked: 0, shared: 0, hidden: 0 });
			}
			const counts = dailyMap.get(day)!;
			if (e.event === "seen") counts.seen++;
			else if (e.event === "liked") counts.liked++;
			else if (e.event === "shared") counts.shared++;
			else if (e.event === "hidden") counts.hidden++;
		}

		// Unique users who interacted
		const uniqueUsers = new Set(events.filter(e => e.userId).map(e => e.userId!.toString()));
		const uniqueSessions = new Set(events.filter(e => e.sessionId).map(e => e.sessionId!));

		// Get userQuestion records for this question
		const userQuestions = await ctx.db
			.query("userQuestions")
			.withIndex("by_questionId", (q) => q.eq("questionId", args.questionId))
			.collect();

		const statusDistribution = {
			unseen: userQuestions.filter(uq => uq.status === "unseen").length,
			seen: userQuestions.filter(uq => uq.status === "seen").length,
			liked: userQuestions.filter(uq => uq.status === "liked").length,
			hidden: userQuestions.filter(uq => uq.status === "hidden").length,
			sent: userQuestions.filter(uq => uq.status === "sent").length,
		};

		return {
			totals: {
				seen: seenEvents.length,
				liked: likedEvents.length,
				shared: sharedEvents.length,
				hidden: hiddenEvents.length,
			},
			viewDuration: {
				average: Math.round(avgDuration),
				max: Math.round(maxDuration),
				totalViews: durations.length,
			},
			reach: {
				uniqueUsers: uniqueUsers.size,
				uniqueSessions: uniqueSessions.size,
			},
			userStatusDistribution: statusDistribution,
			dailyBreakdown: Array.from(dailyMap.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([date, counts]) => ({ date, ...counts })),
		};
	},
});

export const deleteQuestion = mutation({
	args: {
		id: v.id("questions"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		await ctx.db.delete(args.id);
		return null;
	},
});


// Function to fix existing questions by adding lastShownAt field
export const fixExistingQuestions = mutation({
	args: {},
	returns: v.object({
		totalQuestions: v.number(),
		fixedCount: v.number(),
	}),
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		const allQuestions = await ctx.db.query("questions").collect();
		const now = Date.now();
		let fixedCount = 0;

		for (const question of allQuestions) {
			if (question.lastShownAt === undefined) {
				await ctx.db.patch(question._id, {
					lastShownAt: now - Math.random() * 10000000
				});
				fixedCount++;
			}
		}

		return { totalQuestions: allQuestions.length, fixedCount };
	},
});

// Function to update multiple question categories at once
export const updateCategories = mutation({
	args: {
		updates: v.array(v.object({
			id: v.id("questions"),
			style: v.optional(v.string()),
			tone: v.optional(v.string()),
		})),
	},
	returns: v.array(v.object({
		id: v.id("questions"),
		success: v.boolean(),
		error: v.optional(v.string()),
	})),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);
		const results = [];
		for (const update of args.updates) {
			try {
				await ctx.db.patch(update.id, { style: update.style, tone: update.tone });
				results.push({ id: update.id, success: true });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				results.push({ id: update.id, success: false, error: errorMessage });
			}
		}
		return results;
	},
});

// to be executed on a daily schedule
export const cleanDuplicateQuestions = mutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		await ensureAdmin(ctx);
		const allQuestions = await ctx.db.query("questions").collect();

		let totalDeleted = 0;
		const duplicateQuestions = allQuestions.filter((question, index, self) =>
			index !== self.findIndex((t) => t.text === question.text)
		);
		for (const question of duplicateQuestions) {
			await ctx.db.delete(question._id);
			totalDeleted++;
		}

		return totalDeleted;
	},
});

// Get all pending duplicate detections for admin review
export const getPendingDuplicateDetections = query({
	args: {},
	returns: v.array(v.object({
		_id: v.id("duplicateDetections"),
		_creationTime: v.number(),
		questionIds: v.array(v.id("questions")),
		uniqueKey: v.optional(v.string()),
		reason: v.string(),
		rejectReason: v.optional(v.string()),
		confidence: v.number(),
		status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("deleted")),
		reviewedAt: v.optional(v.number()),
		reviewedBy: v.optional(v.id("users")),
		questions: v.array(v.object({
			_id: v.id("questions"),
			_creationTime: v.number(),
			text: v.string(),
			style: v.object({
				_id: v.id("styles"),
				icon: v.string(),
				name: v.string(),
				color: v.string(),
			}),
			tone: v.object({
				_id: v.id("tones"),
				icon: v.string(),
				name: v.string(),
				color: v.string(),
			}),
			totalLikes: v.number(),
			totalShows: v.number(),
		})),
	})),
	handler: async (ctx): Promise<any> => {
		await ensureAdmin(ctx);

		const detections = await ctx.db
			.query("duplicateDetections")
			.withIndex("by_status_and_confidence", (q) => q.eq("status", "pending"))
			.order("desc")
			.collect();

		const detectionsWithQuestions = await Promise.all(
			detections.map(async (detection) => {
				const questions = await Promise.all(
					detection.questionIds.map(async (id) => {
						const question = await ctx.db.get(id);
						if (!question) return null;
						if (!question.styleId || !question.toneId) return null;

						const [styleRaw, toneRaw] = await Promise.all([
							ctx.db.get(question.styleId),
							ctx.db.get(question.toneId),
						]);

						if (!styleRaw || !toneRaw) return null;

						return {
							_id: question._id,
							_creationTime: question._creationTime,
							text: question.text,
							style: {
								_id: styleRaw._id,
								icon: styleRaw.icon,
								name: styleRaw.name,
								color: styleRaw.color,
							},
							tone: {
								_id: toneRaw._id,
								icon: toneRaw.icon,
								name: toneRaw.name,
								color: toneRaw.color,
							},
							totalLikes: question.totalLikes,
							totalShows: question.totalShows,
						};
					})
				);

				const validQuestions = questions.filter((q): q is NonNullable<typeof q> => q !== null);

				if (validQuestions.length < 2) return null;

				return {
					...detection,
					questions: validQuestions,
				};
			})
		);

		return detectionsWithQuestions.filter((d): d is NonNullable<typeof d> => d !== null);
	},
});

// Get all completed duplicate detections for admin review
export const getCompletedDuplicateDetections = query({
	args: {},
	returns: v.array(v.object({
		_id: v.id("duplicateDetections"),
		_creationTime: v.number(),
		questionIds: v.array(v.id("questions")),
		uniqueKey: v.optional(v.string()),
		reason: v.string(),
		rejectReason: v.optional(v.string()),
		confidence: v.number(),
		status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("deleted")),
		reviewedAt: v.optional(v.number()),
		reviewedBy: v.optional(v.id("users")),
		questions: v.array(v.object({
			_id: v.id("questions"),
			_creationTime: v.number(),
			text: v.string(),
			style: v.union(v.null(), v.object({
				_id: v.id("styles"),
				icon: v.string(),
				name: v.string(),
				color: v.string(),
			})),
			tone: v.union(v.null(), v.object({
				_id: v.id("tones"),
				icon: v.string(),
				name: v.string(),
				color: v.string(),
			})),
			totalLikes: v.number(),
			totalShows: v.number(),
		})),
	})),
	handler: async (ctx): Promise<any> => {
		await ensureAdmin(ctx);

		const approvedDetections = await ctx.db
			.query("duplicateDetections")
			.withIndex("by_status_and_confidence", (q) => q.eq("status", "approved"))
			.order("desc")
			.collect();

		const rejectedDetections = await ctx.db
			.query("duplicateDetections")
			.withIndex("by_status_and_confidence", (q) => q.eq("status", "rejected"))
			.order("desc")
			.collect();

		const detections = [...approvedDetections, ...rejectedDetections].sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));

		const detectionsWithDetails = await Promise.all(
			detections.map(async (detection) => {
				const questions = await Promise.all(
					detection.questionIds.map(async (id) => {
						const question = await ctx.db.get(id);
						if (!question) return null;

						let style = null;
						let tone = null;

						if (question.styleId) {
							const styleRaw = await ctx.db.get(question.styleId);
							if (styleRaw) {
								style = {
									_id: styleRaw._id,
									icon: styleRaw.icon,
									name: styleRaw.name,
									color: styleRaw.color,
								};
							}
						}

						if (question.toneId) {
							const toneRaw = await ctx.db.get(question.toneId);
							if (toneRaw) {
								tone = {
									_id: toneRaw._id,
									icon: toneRaw.icon,
									name: toneRaw.name,
									color: toneRaw.color,
								};
							}
						}

						return {
							_id: question._id,
							_creationTime: question._creationTime,
							text: question.text,
							style,
							tone,
							totalLikes: question.totalLikes,
							totalShows: question.totalShows,
						};
					})
				);
				return {
					...detection,
					questions: questions.filter((q): q is NonNullable<typeof q> => q !== null),
				};
			})
		);

		return detectionsWithDetails;
	},
});

// Update duplicate detection status (approve/reject)
export const updateDuplicateDetectionStatus = mutation({
	args: {
		detectionId: v.id("duplicateDetections"),
		status: v.union(v.literal("approved"), v.literal("rejected")),
		reviewerEmail: v.optional(v.string()),
		rejectReason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const reviewer = args.reviewerEmail
			? await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.reviewerEmail)).unique()
			: null;

		// Only include reviewedBy if a valid user was found
		const patchData: {
			status: "approved" | "rejected";
			reviewedAt: number;
			reviewedBy?: Id<"users">;
			rejectReason?: string;
		} = {
			status: args.status,
			reviewedAt: Date.now(),
		};

		if (reviewer) {
			patchData.reviewedBy = reviewer._id;
		}

		if (args.rejectReason) {
			patchData.rejectReason = args.rejectReason;
		}

		await ctx.db.patch(args.detectionId, patchData);

		return null;
	},
});

// Delete duplicate questions after approval
export const deleteDuplicateQuestions = mutation({
	args: {
		detectionId: v.id("duplicateDetections"),
		questionIdsToDelete: v.array(v.id("questions")),
		keepQuestionId: v.optional(v.id("questions")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		for (const questionId of args.questionIdsToDelete) {
			if (args.keepQuestionId && questionId === args.keepQuestionId) {
				continue;
			}
			await ctx.db.delete(questionId);
		}

		await ctx.db.patch(args.detectionId, {
			status: "approved",
			reviewedAt: Date.now(),
		});

		return null;
	},
});

// Public query to get question counts by style and tone combination (for monitoring)
export const getQuestionCountsByStyleAndTonePublic = query({
	args: {},
	returns: v.array(v.object({
		style: v.string(),
		tone: v.string(),
		count: v.number(),
	})),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		// Fetch all questions and filter in JS - more explicit about performance
		const allQuestions = await ctx.db.query("questions").collect();

		// Filter to only questions with both style and tone
		const questions = allQuestions.filter(q => q.style && q.tone);

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

export const getAdminStats = query({
	args: {},
	returns: v.object({
		questions: v.object({
			total: v.number(),
			public: v.number(),
			pending: v.number(),
			pruned: v.number(),
		}),
		users: v.object({
			total: v.number(),
			admins: v.number(),
			casual: v.number(),
		}),
		feedback: v.object({
			total: v.number(),
			new: v.number(),
		}),
		duplicates: v.object({
			pending: v.number(),
		}),
		staleCount: v.number(),
	}),
	handler: async (ctx) => {
		await ensureAdmin(ctx);

		const questions = await ctx.db.query("questions").collect();
		const users = await ctx.db.query("users").collect();
		const feedback = await ctx.db.query("feedback").collect();
		// Use index for pending duplicates
		const duplicates = await ctx.db.query("duplicateDetections")
			.withIndex("by_status", q => q.eq("status", "pending"))
			.collect();

		const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
		const staleCount = questions.filter(q =>
			(q.lastShownAt ?? 0) < oneWeekAgo &&
			q.totalLikes === 0 &&
			q.totalShows > 0 &&
			q.prunedAt === undefined
		).length;

		return {
			questions: {
				total: questions.length,
				public: questions.filter(q => q.status === "public" || q.status === "approved" || !q.status).length,
				pending: questions.filter(q => q.status === "pending").length,
				pruned: questions.filter(q => q.prunedAt !== undefined).length,
			},
			users: {
				total: users.length,
				admins: users.filter(u => u.isAdmin).length,
				casual: users.filter(u => u.subscriptionTier === "casual").length,
			},
			feedback: {
				total: feedback.length,
				new: feedback.filter(f => f.status === "new").length,
			},
			duplicates: {
				pending: duplicates.length,
			},
			staleCount,
		};
	},
});

// ============================================================
// Pool Management Admin Queries and Actions
// ============================================================

// Get pool statistics for a given date
export const getPoolStats = query({
	args: {
		poolDate: v.string(),
	},
	returns: v.object({
		totalQuestions: v.number(),
		availableQuestions: v.number(),
		distributedQuestions: v.number(),
		byStyleTone: v.array(v.object({
			style: v.string(),
			styleName: v.string(),
			tone: v.string(),
			toneName: v.string(),
			count: v.number(),
		})),
	}),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const allQuestions = await ctx.db
			.query("questions")
			.withIndex("by_poolDate_and_poolStatus", (q) => q.eq("poolDate", args.poolDate))
			.collect();

		const available = allQuestions.filter(q => q.poolStatus === "available");
		const distributed = allQuestions.filter(q => q.poolStatus === "distributed");

		const styleToneCounts = new Map<string, { style: string; styleName: string; tone: string; toneName: string; count: number }>();

		const styles = await ctx.db.query("styles").collect();
		const tones = await ctx.db.query("tones").collect();
		const styleMap = new Map(styles.map(s => [s._id.toString(), s]));
		const toneMap = new Map(tones.map(t => [t._id.toString(), t]));

		for (const q of allQuestions) {
			const styleDoc = q.styleId ? styleMap.get(q.styleId.toString()) : null;
			const toneDoc = q.toneId ? toneMap.get(q.toneId.toString()) : null;
			const styleId = q.style || "unknown";
			const toneId = q.tone || "unknown";
			const key = `${styleId}|${toneId}`;

			if (!styleToneCounts.has(key)) {
				styleToneCounts.set(key, {
					style: styleId,
					styleName: styleDoc?.name || styleId,
					tone: toneId,
					toneName: toneDoc?.name || toneId,
					count: 0,
				});
			}
			styleToneCounts.get(key)!.count++;
		}

		return {
			totalQuestions: allQuestions.length,
			availableQuestions: available.length,
			distributedQuestions: distributed.length,
			byStyleTone: Array.from(styleToneCounts.values()).sort((a, b) => b.count - a.count),
		};
	},
});

// Get pool questions for admin review
export const getPoolQuestions = query({
	args: {
		poolDate: v.string(),
		status: v.optional(v.union(v.literal("available"), v.literal("distributed"), v.literal("all"))),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.object({
		_id: v.id("questions"),
		_creationTime: v.number(),
		text: v.optional(v.string()),
		poolStatus: v.optional(v.union(v.literal("available"), v.literal("distributed"))),
		style: v.optional(v.object({
			_id: v.id("styles"),
			name: v.string(),
			icon: v.string(),
			color: v.string(),
		})),
		tone: v.optional(v.object({
			_id: v.id("tones"),
			name: v.string(),
			icon: v.string(),
			color: v.string(),
		})),
	})),
	handler: async (ctx, args) => {
		await ensureAdmin(ctx);

		const limit = args.limit ?? 100;
		const statusFilter = args.status ?? "all";

		let questions: Doc<"questions">[];

		if (statusFilter === "all") {
			questions = await ctx.db
				.query("questions")
				.withIndex("by_poolDate_and_poolStatus", (q) => q.eq("poolDate", args.poolDate))
				.take(limit);
		} else {
			questions = await ctx.db
				.query("questions")
				.withIndex("by_poolDate_and_poolStatus", (q) =>
					q.eq("poolDate", args.poolDate).eq("poolStatus", statusFilter)
				)
				.take(limit);
		}

		const styleIds = Array.from(new Set(questions.map(q => q.styleId).filter(Boolean))) as Id<"styles">[];
		const toneIds = Array.from(new Set(questions.map(q => q.toneId).filter(Boolean))) as Id<"tones">[];

		const [styles, tones] = await Promise.all([
			Promise.all(styleIds.map(id => ctx.db.get(id))),
			Promise.all(toneIds.map(id => ctx.db.get(id))),
		]);

		const styleMap = new Map(styles.filter(Boolean).map(s => [s!._id.toString(), s!]));
		const toneMap = new Map(tones.filter(Boolean).map(t => [t!._id.toString(), t!]));

		return questions.map(q => {
			const styleDoc = q.styleId ? styleMap.get(q.styleId.toString()) : null;
			const toneDoc = q.toneId ? toneMap.get(q.toneId.toString()) : null;

			return {
				_id: q._id,
				_creationTime: q._creationTime,
				text: q.text,
				poolStatus: q.poolStatus,
				style: styleDoc ? {
					_id: styleDoc._id,
					name: styleDoc.name,
					icon: styleDoc.icon,
					color: styleDoc.color,
				} : undefined,
				tone: toneDoc ? {
					_id: toneDoc._id,
					name: toneDoc.name,
					icon: toneDoc.icon,
					color: toneDoc.color,
				} : undefined,
			};
		});
	},
});

// Manually trigger pool generation (admin action)
export const triggerPoolGeneration = action({
	args: {
		targetCount: v.optional(v.number()),
		maxCombinations: v.optional(v.number()),
	},
	returns: v.object({
		questionsGenerated: v.number(),
		combinationsProcessed: v.number(),
		errors: v.array(v.string()),
	}),
	handler: async (ctx, args): Promise<{ questionsGenerated: number; combinationsProcessed: number; errors: string[] }> => {
		await ensureAdmin(ctx);

		const result: { questionsGenerated: number; combinationsProcessed: number; errors: string[] } = await ctx.runAction(internal.internal.ai.generateNightlyQuestionPool, {
			targetCount: args.targetCount ?? 5,
			maxCombinations: args.maxCombinations ?? 10,
		});
		return result;
	},
});

// Manually trigger pool assignment (admin action)
export const triggerPoolAssignment = action({
	args: {
		questionsPerUser: v.optional(v.number()),
	},
	returns: v.object({
		usersProcessed: v.number(),
		totalAssigned: v.number(),
		errors: v.array(v.string()),
	}),
	handler: async (ctx, args): Promise<{ usersProcessed: number; totalAssigned: number; errors: string[] }> => {
		await ensureAdmin(ctx);

		const result: { usersProcessed: number; totalAssigned: number; errors: string[] } = await ctx.runAction(internal.internal.questions.assignPoolQuestionsToUsers, {
			questionsPerUser: args.questionsPerUser ?? 6,
		});
		return result;
	},
});

// Remix a question (admin only)
export const remixQuestion = action({
	args: {
		id: v.id("questions"),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		await ensureAdmin(ctx);
		return await ctx.runAction(internal.internal.ai.remixQuestion, { questionId: args.id });
	},
});
