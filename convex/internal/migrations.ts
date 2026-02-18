import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const BATCH_SIZE = 200;
const cursorArg = v.optional(v.union(v.string(), v.null()));

/**
 * One-time migration: copy embeddings from main tables into dedicated embedding tables.
 * Run repeatedly with returned next cursors until allDone is true. Uses cursor-based
 * batching to stay within Convex transaction limits.
 */
export const copyEmbeddingsToSeparateTables = internalMutation({
	args: {
		questionsCursor: cursorArg,
		stylesCursor: cursorArg,
		tonesCursor: cursorArg,
		topicsCursor: cursorArg,
		usersCursor: cursorArg,
	},
	returns: v.object({
		questions: v.number(),
		styles: v.number(),
		tones: v.number(),
		topics: v.number(),
		users: v.number(),
		nextQuestionsCursor: v.union(v.string(), v.null()),
		nextStylesCursor: v.union(v.string(), v.null()),
		nextTonesCursor: v.union(v.string(), v.null()),
		nextTopicsCursor: v.union(v.string(), v.null()),
		nextUsersCursor: v.union(v.string(), v.null()),
		allDone: v.boolean(),
	}),
	handler: async (ctx, args) => {
		let questions = 0;
		let styles = 0;
		let tones = 0;
		let topics = 0;
		let users = 0;

		let qDone = true;
		let sDone = true;
		let tDone = true;
		let topDone = true;
		let uDone = true;

		// Questions batch
		const qResult = await ctx.db.query("questions").paginate({
			cursor: args.questionsCursor ?? null,
			numItems: BATCH_SIZE,
		});
		qDone = qResult.isDone;
		for (const q of qResult.page) {
			const emb = (q as { embedding?: number[] }).embedding;
			if (!emb || emb.length === 0) continue;
			const existing = await ctx.db
				.query("question_embeddings")
				.withIndex("by_questionId", (idx) => idx.eq("questionId", q._id))
				.first();
			if (existing) continue;
			await ctx.db.insert("question_embeddings", {
				questionId: q._id,
				embedding: emb,
				status: q.status,
				styleId: q.styleId,
				toneId: q.toneId,
				topicId: q.topicId,
			});
			questions++;
		}

		// Styles batch
		const sResult = await ctx.db.query("styles").paginate({
			cursor: args.stylesCursor ?? null,
			numItems: BATCH_SIZE,
		});
		sDone = sResult.isDone;
		for (const s of sResult.page) {
			const emb = (s as { embedding?: number[] }).embedding;
			if (!emb || emb.length === 0) continue;
			const existing = await ctx.db
				.query("style_embeddings")
				.withIndex("by_styleId", (idx) => idx.eq("styleId", s._id))
				.first();
			if (existing) continue;
			await ctx.db.insert("style_embeddings", { styleId: s._id, embedding: emb });
			styles++;
		}

		// Tones batch
		const tResult = await ctx.db.query("tones").paginate({
			cursor: args.tonesCursor ?? null,
			numItems: BATCH_SIZE,
		});
		tDone = tResult.isDone;
		for (const t of tResult.page) {
			const emb = (t as { embedding?: number[] }).embedding;
			if (!emb || emb.length === 0) continue;
			const existing = await ctx.db
				.query("tone_embeddings")
				.withIndex("by_toneId", (idx) => idx.eq("toneId", t._id))
				.first();
			if (existing) continue;
			await ctx.db.insert("tone_embeddings", { toneId: t._id, embedding: emb });
			tones++;
		}

		// Topics batch
		const topResult = await ctx.db.query("topics").paginate({
			cursor: args.topicsCursor ?? null,
			numItems: BATCH_SIZE,
		});
		topDone = topResult.isDone;
		for (const t of topResult.page) {
			const emb = (t as { embedding?: number[] }).embedding;
			if (!emb || emb.length === 0) continue;
			const existing = await ctx.db
				.query("topic_embeddings")
				.withIndex("by_topicId", (idx) => idx.eq("topicId", t._id))
				.first();
			if (existing) continue;
			await ctx.db.insert("topic_embeddings", { topicId: t._id, embedding: emb });
			topics++;
		}

		// Users batch
		const uResult = await ctx.db.query("users").paginate({
			cursor: args.usersCursor ?? null,
			numItems: BATCH_SIZE,
		});
		uDone = uResult.isDone;
		for (const u of uResult.page) {
			const emb = (u as { questionPreferenceEmbedding?: number[] }).questionPreferenceEmbedding;
			if (!emb || emb.length === 0) continue;
			const existing = await ctx.db
				.query("user_embeddings")
				.withIndex("by_userId", (idx) => idx.eq("userId", u._id))
				.first();
			if (existing) continue;
			await ctx.db.insert("user_embeddings", { userId: u._id, embedding: emb });
			users++;
		}

		const allDone = qDone && sDone && tDone && topDone && uDone;
		return {
			questions,
			styles,
			tones,
			topics,
			users,
			nextQuestionsCursor: qDone ? null : qResult.continueCursor,
			nextStylesCursor: sDone ? null : sResult.continueCursor,
			nextTonesCursor: tDone ? null : tResult.continueCursor,
			nextTopicsCursor: topDone ? null : topResult.continueCursor,
			nextUsersCursor: uDone ? null : uResult.continueCursor,
			allDone,
		};
	},
});

/**
 * One-time migration: remove embedding fields from main table documents.
 * Run repeatedly with returned next cursors until allDone is true. Uses cursor-based
 * batching to stay within Convex transaction limits. Run after copyEmbeddingsToSeparateTables
 * and after schema no longer defines these fields.
 */
export const dropEmbeddingsFromMainTables = internalMutation({
	args: {
		questionsCursor: cursorArg,
		stylesCursor: cursorArg,
		tonesCursor: cursorArg,
		topicsCursor: cursorArg,
		usersCursor: cursorArg,
	},
	returns: v.object({
		questions: v.number(),
		styles: v.number(),
		tones: v.number(),
		topics: v.number(),
		users: v.number(),
		nextQuestionsCursor: v.union(v.string(), v.null()),
		nextStylesCursor: v.union(v.string(), v.null()),
		nextTonesCursor: v.union(v.string(), v.null()),
		nextTopicsCursor: v.union(v.string(), v.null()),
		nextUsersCursor: v.union(v.string(), v.null()),
		allDone: v.boolean(),
	}),
	handler: async (ctx, args) => {
		let questions = 0;
		let styles = 0;
		let tones = 0;
		let topics = 0;
		let users = 0;

		// Questions batch
		const qResult = await ctx.db.query("questions").paginate({
			cursor: args.questionsCursor ?? null,
			numItems: BATCH_SIZE,
		});
		for (const q of qResult.page) {
			if ("embedding" in q && (q as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = q as { embedding?: number[]; _id: typeof q._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(q._id, rest as any);
				questions++;
			}
		}

		// Styles batch
		const sResult = await ctx.db.query("styles").paginate({
			cursor: args.stylesCursor ?? null,
			numItems: BATCH_SIZE,
		});
		for (const s of sResult.page) {
			if ("embedding" in s && (s as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = s as { embedding?: number[]; _id: typeof s._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(s._id, rest as any);
				styles++;
			}
		}

		// Tones batch
		const tResult = await ctx.db.query("tones").paginate({
			cursor: args.tonesCursor ?? null,
			numItems: BATCH_SIZE,
		});
		for (const t of tResult.page) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = t as { embedding?: number[]; _id: typeof t._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as any);
				tones++;
			}
		}

		// Topics batch
		const topResult = await ctx.db.query("topics").paginate({
			cursor: args.topicsCursor ?? null,
			numItems: BATCH_SIZE,
		});
		for (const t of topResult.page) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = t as { embedding?: number[]; _id: typeof t._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as any);
				topics++;
			}
		}

		// Users batch
		const uResult = await ctx.db.query("users").paginate({
			cursor: args.usersCursor ?? null,
			numItems: BATCH_SIZE,
		});
		for (const u of uResult.page) {
			if ("questionPreferenceEmbedding" in u && (u as { questionPreferenceEmbedding?: unknown }).questionPreferenceEmbedding !== undefined) {
				const { questionPreferenceEmbedding: _e, _id: _idField, _creationTime, ...rest } = u as { questionPreferenceEmbedding?: number[]; _id: typeof u._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(u._id, rest as any);
				users++;
			}
		}

		const allDone = qResult.isDone && sResult.isDone && tResult.isDone && topResult.isDone && uResult.isDone;
		return {
			questions,
			styles,
			tones,
			topics,
			users,
			nextQuestionsCursor: qResult.isDone ? null : qResult.continueCursor,
			nextStylesCursor: sResult.isDone ? null : sResult.continueCursor,
			nextTonesCursor: tResult.isDone ? null : tResult.continueCursor,
			nextTopicsCursor: topResult.isDone ? null : topResult.continueCursor,
			nextUsersCursor: uResult.isDone ? null : uResult.continueCursor,
			allDone,
		};
	},
});

export const removeOldTimestampFields = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		// Clean up feedback
		const feedbacks = await ctx.db.query("feedback").collect();
		for (const f of feedbacks) {
			if ("createdAt" in f) {
				const { createdAt, _id, _creationTime, ...rest } = f as any;
				await ctx.db.replace(f._id, rest);
			}
		}

		// Clean up pendingSubscriptions
		const subscriptions = await ctx.db.query("pendingSubscriptions").collect();
		for (const s of subscriptions) {
			if ("createdAt" in s) {
				const { createdAt, _id, _creationTime, ...rest } = s as any;
				await ctx.db.replace(s._id, rest);
			}
		}

		// Clean up duplicateDetectionProgress
		const progress = await ctx.db.query("duplicateDetectionProgress").collect();
		for (const p of progress) {
			if ("startedAt" in p) {
				const { startedAt, _id, _creationTime, ...rest } = p as any;
				await ctx.db.replace(p._id, rest);
			}
		}

		// Clean up duplicateDetections
		const detections = await ctx.db.query("duplicateDetections").collect();
		for (const d of detections) {
			if ("detectedAt" in d) {
				const { detectedAt, _id, _creationTime, ...rest } = d as any;
				await ctx.db.replace(d._id, rest);
			}
		}

		return null;
	},
});
