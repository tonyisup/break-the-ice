import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * One-time migration: copy embeddings from main tables into dedicated embedding tables.
 * Run this once before removing embedding fields from the schema.
 */
export const copyEmbeddingsToSeparateTables = internalMutation({
	args: {},
	returns: v.object({
		questions: v.number(),
		styles: v.number(),
		tones: v.number(),
		topics: v.number(),
		users: v.number(),
	}),
	handler: async (ctx) => {
		let questions = 0;
		let styles = 0;
		let tones = 0;
		let topics = 0;
		let users = 0;

		const questionsWithEmb = await ctx.db.query("questions").collect();
		for (const q of questionsWithEmb) {
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
			});
			questions++;
		}

		const stylesWithEmb = await ctx.db.query("styles").collect();
		for (const s of stylesWithEmb) {
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

		const tonesWithEmb = await ctx.db.query("tones").collect();
		for (const t of tonesWithEmb) {
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

		const topicsWithEmb = await ctx.db.query("topics").collect();
		for (const t of topicsWithEmb) {
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

		const usersWithEmb = await ctx.db.query("users").collect();
		for (const u of usersWithEmb) {
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

		return { questions, styles, tones, topics, users };
	},
});

/**
 * One-time migration: remove embedding fields from main table documents.
 * Run this after copyEmbeddingsToSeparateTables and after schema no longer defines these fields.
 * Fixes ReturnsValidationError when old docs still have `embedding` / `questionPreferenceEmbedding` on disk.
 */
export const dropEmbeddingsFromMainTables = internalMutation({
	args: {},
	returns: v.object({
		questions: v.number(),
		styles: v.number(),
		tones: v.number(),
		topics: v.number(),
		users: v.number(),
	}),
	handler: async (ctx) => {
		let questions = 0;
		let styles = 0;
		let tones = 0;
		let topics = 0;
		let users = 0;

		const allQuestions = await ctx.db.query("questions").collect();
		for (const q of allQuestions) {
			if ("embedding" in q && (q as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, ...rest } = q as { embedding?: number[]; [k: string]: unknown };
				await ctx.db.replace(q._id, rest as typeof q);
				questions++;
			}
		}

		const allStyles = await ctx.db.query("styles").collect();
		for (const s of allStyles) {
			if ("embedding" in s && (s as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, ...rest } = s as { embedding?: number[]; [k: string]: unknown };
				await ctx.db.replace(s._id, rest as typeof s);
				styles++;
			}
		}

		const allTones = await ctx.db.query("tones").collect();
		for (const t of allTones) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, ...rest } = t as { embedding?: number[]; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as typeof t);
				tones++;
			}
		}

		const allTopics = await ctx.db.query("topics").collect();
		for (const t of allTopics) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, ...rest } = t as { embedding?: number[]; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as typeof t);
				topics++;
			}
		}

		const allUsers = await ctx.db.query("users").collect();
		for (const u of allUsers) {
			if ("questionPreferenceEmbedding" in u && (u as { questionPreferenceEmbedding?: unknown }).questionPreferenceEmbedding !== undefined) {
				const { questionPreferenceEmbedding: _e, ...rest } = u as { questionPreferenceEmbedding?: number[]; [k: string]: unknown };
				await ctx.db.replace(u._id, rest as typeof u);
				users++;
			}
		}

		return { questions, styles, tones, topics, users };
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
