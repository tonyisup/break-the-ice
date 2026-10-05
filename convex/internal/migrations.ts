import { v, type Infer } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isPrivateUserQuestion, isQuestionPublic, isRetiredQuestion, isUserWrittenQuestion, normalizedRetirement } from "../lib/questionAccess";
import { shownWording, syncReviewedEmbedding } from "../lib/questionReview";
import { settleDuplicateGroup } from "../lib/questionReferences";
import { defaultIdealPromptLength, defaultQualityRubric, defaultToneAxesValue } from "../lib/taxonomy";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "../lib/promptArchitecture";

export const PROMPT_BACKFILL_BATCH_SIZE = 100;

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
				topicId: q.topicId,
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
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = q as { embedding?: number[]; _id: typeof q._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(q._id, rest as any);
				questions++;
			}
		}

		const allStyles = await ctx.db.query("styles").collect();
		for (const s of allStyles) {
			if ("embedding" in s && (s as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = s as { embedding?: number[]; _id: typeof s._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(s._id, rest as any);
				styles++;
			}
		}

		const allTones = await ctx.db.query("tones").collect();
		for (const t of allTones) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = t as { embedding?: number[]; _id: typeof t._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as any);
				tones++;
			}
		}

		const allTopics = await ctx.db.query("topics").collect();
		for (const t of allTopics) {
			if ("embedding" in t && (t as { embedding?: unknown }).embedding !== undefined) {
				const { embedding: _e, _id: _idField, _creationTime, ...rest } = t as { embedding?: number[]; _id: typeof t._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(t._id, rest as any);
				topics++;
			}
		}

		const allUsers = await ctx.db.query("users").collect();
		for (const u of allUsers) {
			if ("questionPreferenceEmbedding" in u && (u as { questionPreferenceEmbedding?: unknown }).questionPreferenceEmbedding !== undefined) {
				const { questionPreferenceEmbedding: _e, _id: _idField, _creationTime, ...rest } = u as { questionPreferenceEmbedding?: number[]; _id: typeof u._id; _creationTime: number; [k: string]: unknown };
				await ctx.db.replace(u._id, rest as any);
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

/**
 * Fills the prompt architecture fields older styles, tones, topics and questions lack (slugs,
 * versions, fingerprint, source, safety flags, quality), then adds the default blueprint. Values
 * already set are kept, apart from updatedAt on the styles, tones and topics it fills. Private
 * personal, team and organization questions are left alone (see isPrivateUserQuestion). It has
 * no dry run and schedules itself stage by stage. To fingerprint library questions that have
 * none, start at the questions stage (add --prod after `run` for production), then check that a
 * recomputeQuestionFingerprints dry run shows fewer `withoutFingerprint`:
 * `npx convex run internal/migrations:backfillPromptArchitecture '{"stage":"questions"}'`.
 * As with the recompute, undoing an earlier review of a question it fingerprints is then refused
 * as a newer change.
 */
export const backfillPromptArchitecture = internalMutation({
	args: {
		stage: v.optional(
			v.union(
				v.literal("styles"),
				v.literal("tones"),
				v.literal("topics"),
				v.literal("questions"),
				v.literal("blueprints"),
			),
		),
		// Where the questions stage got to. It reads pages rather than re-querying, so the
		// questions it skips don't come back in every batch.
		cursor: v.optional(v.string()),
	},
	returns: v.object({
		stylesUpdated: v.number(),
		tonesUpdated: v.number(),
		topicsUpdated: v.number(),
		questionsUpdated: v.number(),
		blueprintsInserted: v.number(),
	}),
	handler: async (ctx, args) => {
		let stylesUpdated = 0;
		let tonesUpdated = 0;
		let topicsUpdated = 0;
		let questionsUpdated = 0;
		let blueprintsInserted = 0;
		const now = Date.now();
		const stage = args.stage ?? "styles";
		let nextStage:
			| "styles"
			| "tones"
			| "topics"
			| "questions"
			| "blueprints"
			| null = null;
		let nextCursor: string | undefined;

		if (stage === "styles") {
			const styles = await ctx.db
				.query("styles")
				.filter((q) =>
					q.or(
						q.eq(q.field("slug"), undefined),
						q.eq(q.field("status"), undefined),
						q.eq(q.field("version"), undefined),
						q.eq(q.field("aiGuidance"), undefined),
						q.eq(q.field("quality"), undefined),
						q.eq(q.field("structuralInstruction"), undefined),
						q.eq(q.field("idealPromptLength"), undefined),
						q.eq(q.field("riskLevel"), undefined),
					),
				)
				.take(PROMPT_BACKFILL_BATCH_SIZE);
			for (const style of styles) {
				await ctx.db.patch(style._id, {
					slug: style.slug ?? style.id,
					status: style.status ?? "active",
					version: style.version ?? 1,
					aiGuidance: style.aiGuidance ?? style.promptGuidanceForAI ?? "",
					safetyNotes: style.safetyNotes ?? "Prefer low-stakes, socially safe prompts.",
					commonFailureModes: style.commonFailureModes ?? [],
					distinctFrom: style.distinctFrom ?? [],
					examples: style.examples ?? (style.example ? [{ text: style.example }] : []),
					antiExamples: style.antiExamples ?? [],
					quality: style.quality ?? defaultQualityRubric(),
					createdAt: style.createdAt ?? style._creationTime ?? now,
					updatedAt: now,
					cognitiveMove: style.cognitiveMove ?? "reflect",
					socialFunction:
						style.socialFunction ?? "Reveals taste and priorities through conversation.",
					structuralInstruction: style.structuralInstruction ?? style.structure,
					answerShape: style.answerShape ?? "short conversational answer",
					idealPromptLength: style.idealPromptLength ?? defaultIdealPromptLength(),
					riskLevel: style.riskLevel ?? "low",
				});
				stylesUpdated++;
			}
			nextStage = styles.length === PROMPT_BACKFILL_BATCH_SIZE ? "styles" : "tones";
		}

		if (stage === "tones") {
			const tones = await ctx.db
				.query("tones")
				.filter((q) =>
					q.or(
						q.eq(q.field("slug"), undefined),
						q.eq(q.field("status"), undefined),
						q.eq(q.field("version"), undefined),
						q.eq(q.field("aiGuidance"), undefined),
						q.eq(q.field("quality"), undefined),
						q.eq(q.field("languageCues"), undefined),
						q.eq(q.field("avoidCues"), undefined),
						q.eq(q.field("emotionalAxes"), undefined),
					),
				)
				.take(PROMPT_BACKFILL_BATCH_SIZE);
			for (const tone of tones) {
				await ctx.db.patch(tone._id, {
					slug: tone.slug ?? tone.id,
					status: tone.status ?? "active",
					version: tone.version ?? 1,
					aiGuidance: tone.aiGuidance ?? tone.promptGuidanceForAI ?? "",
					safetyNotes: tone.safetyNotes ?? "Keep language socially safe and low-friction.",
					commonFailureModes: tone.commonFailureModes ?? [],
					distinctFrom: tone.distinctFrom ?? [],
					examples: tone.examples ?? [],
					antiExamples: tone.antiExamples ?? [],
					quality: tone.quality ?? defaultQualityRubric(),
					createdAt: tone.createdAt ?? tone._creationTime ?? now,
					updatedAt: now,
					languageCues: tone.languageCues ?? [],
					avoidCues: tone.avoidCues ?? [],
					emotionalAxes: tone.emotionalAxes ?? defaultToneAxesValue(),
				});
				tonesUpdated++;
			}
			nextStage = tones.length === PROMPT_BACKFILL_BATCH_SIZE ? "tones" : "topics";
		}

		if (stage === "topics") {
			const topics = await ctx.db
				.query("topics")
				.filter((q) =>
					q.or(
						q.eq(q.field("slug"), undefined),
						q.eq(q.field("status"), undefined),
						q.eq(q.field("version"), undefined),
						q.eq(q.field("aiGuidance"), undefined),
						q.eq(q.field("quality"), undefined),
						q.eq(q.field("scopeBoundaries"), undefined),
						q.eq(q.field("referencePool"), undefined),
					),
				)
				.take(PROMPT_BACKFILL_BATCH_SIZE);
			for (const topic of topics) {
				await ctx.db.patch(topic._id, {
					slug: topic.slug ?? topic.id,
					status: topic.status ?? "active",
					version: topic.version ?? 1,
					aiGuidance: topic.aiGuidance ?? topic.promptGuidanceForAI ?? "",
					safetyNotes: topic.safetyNotes ?? "Keep topics broadly answerable and socially safe.",
					commonFailureModes: topic.commonFailureModes ?? [],
					distinctFrom: topic.distinctFrom ?? [],
					examples: topic.examples ?? (topic.example ? [{ text: topic.example }] : []),
					antiExamples: topic.antiExamples ?? [],
					quality: topic.quality ?? defaultQualityRubric(),
					createdAt: topic.createdAt ?? topic._creationTime ?? now,
					updatedAt: now,
					scopeBoundaries: topic.scopeBoundaries ?? [],
					referencePool: topic.referencePool ?? [],
					accessibilityNotes: topic.accessibilityNotes ?? undefined,
				});
				topicsUpdated++;
			}
			nextStage = topics.length === PROMPT_BACKFILL_BATCH_SIZE ? "topics" : "questions";
		}

		if (stage === "questions") {
			const [allStyles, allTones, allTopics] = await Promise.all([
				ctx.db.query("styles").collect(),
				ctx.db.query("tones").collect(),
				ctx.db.query("topics").collect(),
			]);
			const questionStyles = new Map(allStyles.map((style) => [style._id.toString(), style]));
			const questionTones = new Map(allTones.map((tone) => [tone._id.toString(), tone]));
			const questionTopics = new Map(allTopics.map((topic) => [topic._id.toString(), topic]));
			// Unfiltered, so each page reads one batch. A filtered page keeps reading until it has a
			// batch of matches, which can be most of the table.
			const page = await ctx.db
				.query("questions")
				.paginate({ numItems: PROMPT_BACKFILL_BATCH_SIZE, cursor: args.cursor ?? null });
			for (const question of page.page) {
				const needsBackfill = [
					question.styleSlug,
					question.toneSlug,
					question.styleVersion,
					question.toneVersion,
					question.fingerprint,
					question.source,
					question.safetyFlags,
					question.quality,
				].includes(undefined);
				if (!needsBackfill) continue;
				// Not a library question: the backfill leaves it alone, fingerprint included (see
				// isPrivateUserQuestion).
				if (isPrivateUserQuestion(question)) continue;
				const style = question.styleId ? questionStyles.get(question.styleId.toString()) : null;
				const tone = question.toneId ? questionTones.get(question.toneId.toString()) : null;
				const topic = question.topicId ? questionTopics.get(question.topicId.toString()) : null;
				const text = question.text ?? question.customText;
				await ctx.db.patch(question._id, {
					styleSlug: question.styleSlug ?? style?.slug ?? style?.id ?? question.style,
					toneSlug: question.toneSlug ?? tone?.slug ?? tone?.id ?? question.tone,
					topicSlug: question.topicSlug ?? topic?.slug ?? topic?.id ?? question.topic,
					styleVersion: question.styleVersion ?? style?.version ?? 1,
					toneVersion: question.toneVersion ?? tone?.version ?? 1,
					topicVersion: question.topicVersion ?? topic?.version ?? 1,
					fingerprint: question.fingerprint ?? (text ? fingerprintText(text) : undefined),
					source:
						question.source ??
						(question.isAIGenerated ? "ai" : question.authorId ? "editor" : "seed"),
					safetyFlags: question.safetyFlags ?? [],
					moderationNotes: question.moderationNotes ?? undefined,
					quality: question.quality ?? {},
					style: question.style ?? style?.slug ?? style?.id,
					tone: question.tone ?? tone?.slug ?? tone?.id,
					topic: question.topic ?? topic?.slug ?? topic?.id,
				});
				questionsUpdated++;
			}
			nextStage = page.isDone ? "blueprints" : "questions";
			nextCursor = page.isDone ? undefined : page.continueCursor;
		}

		if (stage === "blueprints") {
			const existingBlueprints = await ctx.db
				.query("promptBlueprints")
				.withIndex("by_slug", (q) => q.eq("slug", DEFAULT_BLUEPRINT_SLUG))
				.collect();
			if (existingBlueprints.length === 0) {
				await ctx.db.insert("promptBlueprints", {
					slug: DEFAULT_BLUEPRINT_SLUG,
					version: 1,
					status: "active",
					systemInstruction:
						"Generate feed-friendly ice-breaker questions that are easy to read quickly and rewarding to answer. Optimize for specificity, answerability, replayability, and clean preference signals. Each question should feel like one strong card in an infinite scroll feed, not a workshop exercise.",
					safetyChecklist: [
						"avoid trauma mining",
						"avoid explicit sexual content",
						"avoid self-harm or suicide themes",
						"avoid criminal confession framing",
						"avoid humiliation as core mechanic",
						"avoid medical or legal panic scenarios",
						"avoid politics or religion by default",
						"prefer low-stakes vulnerability",
						"prefer harmless embarrassment and relatable habits",
					],
					qualityChecklist: [
						"prompt must be understood in a few seconds",
						"prefer scenes over categories",
						"prefer specific over generic",
						"prefer constraints that reveal taste or values",
						"avoid bland favorites",
						"avoid obvious correct answers",
						"favor stories, habits, quirks, and memorable preferences",
						"keep answers accessible without niche expertise",
						"make batch outputs meaningfully distinct from each other",
					],
					outputFormatInstruction:
						"Each question should be a single sentence ending with one question mark. Do not number the questions. Do not include commentary outside the JSON.",
					createdAt: now,
					updatedAt: now,
				});
				blueprintsInserted++;
			}
			nextStage = null;
		}

		if (nextStage) {
			await ctx.scheduler.runAfter(0, internal.internal.migrations.backfillPromptArchitecture, {
				stage: nextStage,
				cursor: nextCursor,
			});
		}

		return {
			stylesUpdated,
			tonesUpdated,
			topicsUpdated,
			questionsUpdated,
			blueprintsInserted,
		};
	},
});

const DANGLING_CLEANUP_PAGE_SIZE = 100;
const DANGLING_CLEANUP_TABLES = [
	"question_embeddings",
	"userQuestions",
	"question_collections",
	"pruning",
	"duplicateDetections",
] as const;
const danglingCleanupTable = v.union(...DANGLING_CLEANUP_TABLES.map((table) => v.literal(table)));
const danglingCleanupCounts = {
	scanned: v.number(),
	dangling: v.number(),
	removed: v.number(),
	updated: v.number(),
};
const danglingCleanupPageResult = v.object({
	...danglingCleanupCounts,
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * One page of the dangling-reference cleanup: the same rows lib/questionReferences.ts removes
 * when a question is deleted, and history is kept. With `dryRun` it writes nothing and reports
 * what a real run would remove and update. (Two pending groups that shrink to the same pair
 * both show as updated in a dry run; the real run drops the second.)
 */
export const cleanDanglingQuestionReferencesPage = internalMutation({
	args: {
		table: danglingCleanupTable,
		dryRun: v.boolean(),
		cursor: v.union(v.string(), v.null()),
	},
	returns: danglingCleanupPageResult,
	handler: async (ctx, args) => {
		const exists = async (questionId: Id<"questions">) => (await ctx.db.get(questionId)) !== null;
		const paginationOpts = { numItems: DANGLING_CLEANUP_PAGE_SIZE, cursor: args.cursor };
		let dangling = 0;
		let removed = 0;
		let updated = 0;

		if (args.table === "duplicateDetections") {
			const page = await ctx.db
				.query("duplicateDetections")
				.withIndex("by_status", (q) => q.eq("status", "pending"))
				.paginate(paginationOpts);
			for (const detection of page.page) {
				const outcome = await settleDuplicateGroup(ctx, detection, exists, args.dryRun);
				if (outcome === "unchanged") continue;
				dangling += 1;
				if (outcome === "deleted") removed += 1;
				else updated += 1;
			}
			return { scanned: page.page.length, dangling, removed, updated, continueCursor: page.continueCursor, isDone: page.isDone };
		}

		const page =
			args.table === "pruning"
				? await ctx.db.query("pruning").withIndex("by_status", (q) => q.eq("status", "pending")).paginate(paginationOpts)
				: await ctx.db.query(args.table).paginate(paginationOpts);
		for (const row of page.page) {
			if (await exists(row.questionId)) continue;
			dangling += 1;
			removed += 1;
			if (!args.dryRun) await ctx.db.delete(row._id);
		}
		return { scanned: page.page.length, dangling, removed, updated, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * Removes rows left pointing at hard-deleted questions: orphan embeddings, per-user rows,
 * collection entries, pending pruning reviews and pending duplicate groups. Run it with dryRun
 * first, and again after a real run (every table should then show dangling 0):
 * `npx convex run internal/migrations:cleanDanglingQuestionReferences '{"dryRun":true}'`.
 */
export const cleanDanglingQuestionReferences = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.array(v.object({ table: v.string(), ...danglingCleanupCounts })),
	handler: async (ctx, args) => {
		const summary = [];
		for (const table of DANGLING_CLEANUP_TABLES) {
			const totals = { table, scanned: 0, dangling: 0, removed: 0, updated: 0 };
			const countKeys = Object.keys(danglingCleanupCounts) as Array<keyof typeof danglingCleanupCounts>;
			let cursor: string | null = null;
			for (;;) {
				const page: Infer<typeof danglingCleanupPageResult> = await ctx.runMutation(
					internal.internal.migrations.cleanDanglingQuestionReferencesPage,
					{ table, dryRun: args.dryRun, cursor },
				);
				for (const key of countKeys) totals[key] += page[key];
				// A record of each page that changed something, so a run that stops partway
				// still shows what it did.
				if (page.dangling > 0) {
					console.log(`cleanDanglingQuestionReferences${args.dryRun ? " (dry run)" : ""} ${table} page: ${JSON.stringify(page)}`);
				}
				if (page.isDone) break;
				cursor = page.continueCursor;
			}
			console.log(`cleanDanglingQuestionReferences${args.dryRun ? " (dry run)" : ""} ${table} total: ${JSON.stringify(totals)}`);
			summary.push(totals);
		}
		return summary;
	},
});

export const FINGERPRINT_RECOMPUTE_PAGE_SIZE = 100;
// Convex keeps at most 256 log lines per run, so progress is logged every this many pages.
const FINGERPRINT_PROGRESS_LOG_PAGES = 50;
// Convex arrays hold at most 8,192 values, so the report lists this many groups, and this many
// questions in each, and counts the rest.
export const FINGERPRINT_MAX_REPORTED_COLLISIONS = 1000;
export const FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS = 50;
const fingerprintRecomputeCounts = {
	scanned: v.number(),
	privateUserQuestions: v.number(),
	withoutFingerprint: v.number(),
	withoutText: v.number(),
	changed: v.number(),
};
const fingerprintCollisionQuestion = v.object({
	questionId: v.id("questions"),
	status: v.optional(v.string()),
	organizationId: v.optional(v.id("organizations")),
});
const fingerprintRecomputePageResult = v.object({
	...fingerprintRecomputeCounts,
	// Each public, unretired question's fingerprint once the page is done, for the collision
	// report: only these can collide.
	live: v.array(v.object({ ...fingerprintCollisionQuestion.fields, fingerprint: v.string() })),
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * One page of the fingerprint recompute. With `dryRun` it writes nothing and reports what a real
 * run would change.
 */
export const recomputeQuestionFingerprintsPage = internalMutation({
	args: { dryRun: v.boolean(), cursor: v.union(v.string(), v.null()) },
	returns: fingerprintRecomputePageResult,
	handler: async (ctx, args) => {
		const page = await ctx.db.query("questions").paginate({ numItems: FINGERPRINT_RECOMPUTE_PAGE_SIZE, cursor: args.cursor });
		const counts = { scanned: page.page.length, privateUserQuestions: 0, withoutFingerprint: 0, withoutText: 0, changed: 0 };
		const live: Infer<typeof fingerprintRecomputePageResult>["live"] = [];
		for (const question of page.page) {
			if (isPrivateUserQuestion(question)) {
				counts.privateUserQuestions += 1;
				continue;
			}
			// Only stored fingerprints are recomputed; a library question without one stays without.
			if (question.fingerprint === undefined) {
				counts.withoutFingerprint += 1;
				continue;
			}
			// An approved submission can keep its wording in customText only, as the backfill read it.
			const text = question.text ?? question.customText;
			let fingerprint = question.fingerprint;
			if (!text) {
				counts.withoutText += 1;
			} else if (fingerprintText(text) !== fingerprint) {
				fingerprint = fingerprintText(text);
				counts.changed += 1;
				if (!args.dryRun) await ctx.db.patch(question._id, { fingerprint });
			}
			// Only public, unretired questions can collide. Retired, private and held copies keep their
			// fingerprints, so generation still won't recreate them, but aren't listed.
			if (isQuestionPublic(question) && !isRetiredQuestion(question)) {
				live.push({ questionId: question._id, status: question.status, organizationId: question.organizationId, fingerprint });
			}
		}
		return { ...counts, live, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * Recomputes stored question fingerprints with the current fingerprintText. Fingerprints saved
 * before curly quotes were normalized don't match a recomputation, so generation doesn't see a
 * candidate as a duplicate of a library question that differs only in quote style.
 *
 * Only library questions are recomputed. Personal, team and organization questions that aren't
 * public (`privateUserQuestions`), library questions with no stored fingerprint, and ones with no
 * text to fingerprint are counted and left alone. A pruned submission counts as private however
 * it was pruned, including by older pruning that set only `prunedAt` (see isRetiredQuestion).
 * Until it has run after the quote fix deploys, generation can save copies of curly-quoted
 * library questions, so run it soon after deploying (on dev too, before evals). `withoutFingerprint` includes questions added with admin
 * createQuestion before it set a fingerprint, which generation can't see as duplicates; the
 * backfill's questions stage fingerprints them. clearPrivateQuestionFingerprints removes the
 * fingerprints private questions still hold.
 *
 * `collisionGroups` counts the fingerprints that two or more public, unretired library questions
 * share after the run. `collisions` lists the first FINGERPRINT_MAX_REPORTED_COLLISIONS of them,
 * each with its `size` and up to FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS questions (IDs, status
 * and organization, no text), oldest first. A fingerprint is a short hash, so compare the
 * wording before treating a group as duplicates. Generation treats any of them as the existing
 * copy, so nothing breaks if they stay. Retire copies on the admin duplicates page, which keeps
 * their links working; pruning one on the questions page breaks them.
 *
 * A run is safe to repeat. A fingerprint can go stale again later (an undo can restore an old
 * one), and a copy held for review isn't listed until it's approved, so check later dry runs for
 * changed above 0 or new collisions. Run it with dryRun first, and again after a real run
 * (changed should then be 0); add --prod after `run` for production:
 * `npx convex run internal/migrations:recomputeQuestionFingerprints '{"dryRun":true}'`.
 */
export const recomputeQuestionFingerprints = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.object({
		...fingerprintRecomputeCounts,
		collisionGroups: v.number(),
		collisions: v.array(
			v.object({ fingerprint: v.string(), size: v.number(), questions: v.array(fingerprintCollisionQuestion) }),
		),
	}),
	handler: async (ctx, args) => {
		const label = `recomputeQuestionFingerprints${args.dryRun ? " (dry run)" : ""}`;
		const totals = { scanned: 0, privateUserQuestions: 0, withoutFingerprint: 0, withoutText: 0, changed: 0 };
		const countKeys = Object.keys(fingerprintRecomputeCounts) as Array<keyof typeof fingerprintRecomputeCounts>;
		const groups = new Map<string, Array<Infer<typeof fingerprintCollisionQuestion>>>();
		let cursor: string | null = null;
		for (let pages = 1; ; pages++) {
			const page: Infer<typeof fingerprintRecomputePageResult> = await ctx.runMutation(
				internal.internal.migrations.recomputeQuestionFingerprintsPage,
				{ dryRun: args.dryRun, cursor },
			);
			for (const key of countKeys) totals[key] += page[key];
			for (const { fingerprint, ...question } of page.live) {
				const group = groups.get(fingerprint);
				if (group) group.push(question);
				else groups.set(fingerprint, [question]);
			}
			if (page.isDone) break;
			// Running totals, so a run that stops partway still shows how far it got.
			if (pages % FINGERPRINT_PROGRESS_LOG_PAGES === 0) console.log(`${label} progress: ${JSON.stringify(totals)}`);
			cursor = page.continueCursor;
		}
		const collisions = [...groups].filter(([, questions]) => questions.length > 1);
		console.log(`${label} total: ${JSON.stringify({ ...totals, collisionGroups: collisions.length })}`);
		return {
			...totals,
			collisionGroups: collisions.length,
			collisions: collisions.slice(0, FINGERPRINT_MAX_REPORTED_COLLISIONS).map(([fingerprint, questions]) => ({
				fingerprint,
				size: questions.length,
				questions: questions.slice(0, FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS),
			})),
		};
	},
});

export const PRIVATE_FINGERPRINT_CLEAR_PAGE_SIZE = 100;
const privateFingerprintCounts = {
	scanned: v.number(),
	privateUserQuestions: v.number(),
	cleared: v.number(),
};
const privateFingerprintPageResult = v.object({
	...privateFingerprintCounts,
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * One page of the private fingerprint cleanup. With `dryRun` it writes nothing and reports what a
 * real run would clear.
 */
export const clearPrivateQuestionFingerprintsPage = internalMutation({
	args: { dryRun: v.boolean(), cursor: v.union(v.string(), v.null()) },
	returns: privateFingerprintPageResult,
	handler: async (ctx, args) => {
		const page = await ctx.db.query("questions").paginate({ numItems: PRIVATE_FINGERPRINT_CLEAR_PAGE_SIZE, cursor: args.cursor });
		const counts = { scanned: page.page.length, privateUserQuestions: 0, cleared: 0 };
		for (const question of page.page) {
			if (!isPrivateUserQuestion(question)) continue;
			counts.privateUserQuestions += 1;
			if (question.fingerprint === undefined) continue;
			counts.cleared += 1;
			if (!args.dryRun) await ctx.db.patch(question._id, { fingerprint: undefined });
		}
		return { ...counts, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * Clears the fingerprint on personal, team and organization questions that aren't public: only
 * library questions keep one (see isPrivateUserQuestion). It reports counts only. Making one of
 * these questions public fingerprints it again.
 *
 * Earlier reviews of a cleared question can still be undone: undo doesn't compare a private
 * question's fingerprint. Run the real cleanup once this deploy is settled, since older code
 * fingerprints these questions again and refuses those undos. Run it with dryRun first, and
 * again after a real run (cleared should then be 0); add --prod after `run` for production:
 * `npx convex run internal/migrations:clearPrivateQuestionFingerprints '{"dryRun":true}'`.
 */
export const clearPrivateQuestionFingerprints = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.object(privateFingerprintCounts),
	handler: async (ctx, args) => {
		const label = `clearPrivateQuestionFingerprints${args.dryRun ? " (dry run)" : ""}`;
		const totals = { scanned: 0, privateUserQuestions: 0, cleared: 0 };
		const countKeys = Object.keys(privateFingerprintCounts) as Array<keyof typeof privateFingerprintCounts>;
		let cursor: string | null = null;
		for (let pages = 1; ; pages++) {
			const page: Infer<typeof privateFingerprintPageResult> = await ctx.runMutation(
				internal.internal.migrations.clearPrivateQuestionFingerprintsPage,
				{ dryRun: args.dryRun, cursor },
			);
			for (const key of countKeys) totals[key] += page[key];
			if (page.isDone) break;
			// Running totals, so a run that stops partway still shows how far it got.
			if (pages % FINGERPRINT_PROGRESS_LOG_PAGES === 0) console.log(`${label} progress: ${JSON.stringify(totals)}`);
			cursor = page.continueCursor;
		}
		console.log(`${label} total: ${JSON.stringify(totals)}`);
		return totals;
	},
});

export const PRIVATE_EMBEDDING_CLEAR_PAGE_SIZE = 100;
const privateEmbeddingCounts = {
	scanned: v.number(),
	privateUserQuestions: v.number(),
	cleared: v.number(),
};
const privateEmbeddingPageResult = v.object({
	...privateEmbeddingCounts,
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * One page of the private embedding cleanup. With `dryRun` it writes nothing and reports what a
 * real run would clear. It pages over every question, unfiltered: a filtered paginate can read
 * most of the table to fill one page.
 */
export const clearPrivateQuestionEmbeddingsPage = internalMutation({
	args: { dryRun: v.boolean(), cursor: v.union(v.string(), v.null()) },
	returns: privateEmbeddingPageResult,
	handler: async (ctx, args) => {
		const page = await ctx.db.query("questions").paginate({ numItems: PRIVATE_EMBEDDING_CLEAR_PAGE_SIZE, cursor: args.cursor });
		const counts = { scanned: page.page.length, privateUserQuestions: 0, cleared: 0 };
		for (const question of page.page) {
			if (!isPrivateUserQuestion(question)) continue;
			counts.privateUserQuestions += 1;
			const embeddings = await ctx.db
				.query("question_embeddings")
				.withIndex("by_questionId", (q) => q.eq("questionId", question._id))
				.collect();
			counts.cleared += embeddings.length;
			if (!args.dryRun) for (const embedding of embeddings) await ctx.db.delete(embedding._id);
		}
		return { ...counts, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * Deletes the embeddings of personal, team and organization questions that aren't public: only
 * library and public questions keep one, of the wording they show (see syncReviewedEmbedding).
 * `cleared` counts embedding rows deleted, and it reports counts only. Making one of these
 * questions public embeds it again.
 *
 * Run it with dryRun first, and again after a real run (cleared should then be 0); add --prod
 * after `run` for production:
 * `npx convex run internal/migrations:clearPrivateQuestionEmbeddings '{"dryRun":true}'`.
 */
export const clearPrivateQuestionEmbeddings = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.object(privateEmbeddingCounts),
	handler: async (ctx, args) => {
		const label = `clearPrivateQuestionEmbeddings${args.dryRun ? " (dry run)" : ""}`;
		const totals = { scanned: 0, privateUserQuestions: 0, cleared: 0 };
		const countKeys = Object.keys(privateEmbeddingCounts) as Array<keyof typeof privateEmbeddingCounts>;
		let cursor: string | null = null;
		for (let pages = 1; ; pages++) {
			const page: Infer<typeof privateEmbeddingPageResult> = await ctx.runMutation(
				internal.internal.migrations.clearPrivateQuestionEmbeddingsPage,
				{ dryRun: args.dryRun, cursor },
			);
			for (const key of countKeys) totals[key] += page[key];
			if (page.isDone) break;
			// Running totals, so a run that stops partway still shows how far it got.
			if (pages % FINGERPRINT_PROGRESS_LOG_PAGES === 0) console.log(`${label} progress: ${JSON.stringify(totals)}`);
			cursor = page.continueCursor;
		}
		console.log(`${label} total: ${JSON.stringify(totals)}`);
		return totals;
	},
});

export const RETIRED_NORMALIZE_PAGE_SIZE = 100;
// The run reports the IDs of the first this many questions in each bucket, for spot checks, and
// counts the rest.
export const RETIRED_NORMALIZE_MAX_REPORTED_IDS = 100;
const retiredNormalizeCounts = {
	scanned: v.number(),
	markedPruned: v.number(),
	prunedAtCleared: v.number(),
	// Personal, team and organization questions that end up not public, moved to "pruned" or
	// losing `prunedAt`, and still held a fingerprint.
	fingerprintsCleared: v.number(),
};
const retiredNormalizeIds = {
	markedPrunedIds: v.array(v.id("questions")),
	prunedAtClearedIds: v.array(v.id("questions")),
};
const retiredNormalizePageResult = v.object({
	...retiredNormalizeCounts,
	// Every question the page changed (or would change), at most a page's worth.
	...retiredNormalizeIds,
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * One page of the retirement cleanup. With `dryRun` it writes nothing and reports what a real run
 * would change. It pages over every question, unfiltered: a filtered paginate can read most of the
 * table to fill one page.
 */
export const normalizeRetiredQuestionsPage = internalMutation({
	args: { dryRun: v.boolean(), cursor: v.union(v.string(), v.null()) },
	returns: retiredNormalizePageResult,
	handler: async (ctx, args) => {
		const page = await ctx.db.query("questions").paginate({ numItems: RETIRED_NORMALIZE_PAGE_SIZE, cursor: args.cursor });
		const counts = { scanned: page.page.length, markedPruned: 0, prunedAtCleared: 0, fingerprintsCleared: 0 };
		const ids = { markedPrunedIds: [] as Id<"questions">[], prunedAtClearedIds: [] as Id<"questions">[] };
		for (const question of page.page) {
			const normalized = normalizedRetirement(question);
			if (normalized.status === question.status && normalized.prunedAt === question.prunedAt) continue;
			if (normalized.status === "pruned") {
				counts.markedPruned += 1;
				ids.markedPrunedIds.push(question._id);
			} else {
				counts.prunedAtCleared += 1;
				ids.prunedAtClearedIds.push(question._id);
			}
			const after = { ...question, ...normalized };
			// Only library questions keep a fingerprint, and a pruned submission isn't one (see
			// isPrivateUserQuestion).
			const clearFingerprint = isPrivateUserQuestion(after) && question.fingerprint !== undefined;
			if (clearFingerprint) counts.fingerprintsCleared += 1;
			if (args.dryRun) continue;
			await ctx.db.patch(question._id, { ...normalized, ...(clearFingerprint ? { fingerprint: undefined } : {}) });
			// The wording doesn't change, so a question that stays public keeps the embedding it has,
			// and a private one drops its embeddings (see syncReviewedEmbedding).
			if (isPrivateUserQuestion(after)) {
				await syncReviewedEmbedding(ctx, { ...after, fingerprint: undefined }, shownWording(question));
			}
			await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, { questionId: question._id });
		}
		return { ...counts, ...ids, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

/**
 * Normalizes questions retired before isRetiredQuestion's rule. Older pruning set only `prunedAt`
 * and left the status as it was, so the feed and other lists that select by status kept showing
 * them; these move to status "pruned" (`markedPruned`). A question its author edited after it was
 * pruned has gone back through review as pending or private, so it loses `prunedAt` instead
 * (`prunedAtCleared`). A personal, team or organization question that ends up not public, either
 * moved to "pruned" or left pending or private without `prunedAt`, is private, so it drops any
 * fingerprint it still holds and its embeddings, as approvePruning does; `fingerprintsCleared`
 * counts the fingerprints dropped in both cases. A library question keeps its fingerprint and
 * embeddings.
 *
 * Besides the counts, `markedPrunedIds` and `prunedAtClearedIds` list the IDs (no text) of the
 * first RETIRED_NORMALIZE_MAX_REPORTED_IDS questions in each bucket, in table order, for spot
 * checks; the counts include the rest.
 *
 * It doesn't record a review or change reviewRevision, and undo compares and restores retirement
 * normalized (see normalizedRetirement), so earlier reviews of these questions can still be
 * undone, before or after it runs. Run it with dryRun first, and again after a real run
 * (markedPruned and prunedAtCleared should then be 0); add --prod after `run` for production:
 * `npx convex run internal/migrations:normalizeRetiredQuestions '{"dryRun":true}'`.
 */
export const normalizeRetiredQuestions = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.object({ ...retiredNormalizeCounts, ...retiredNormalizeIds }),
	handler: async (ctx, args) => {
		const label = `normalizeRetiredQuestions${args.dryRun ? " (dry run)" : ""}`;
		const totals = { scanned: 0, markedPruned: 0, prunedAtCleared: 0, fingerprintsCleared: 0 };
		const countKeys = Object.keys(retiredNormalizeCounts) as Array<keyof typeof retiredNormalizeCounts>;
		const ids = { markedPrunedIds: [] as Id<"questions">[], prunedAtClearedIds: [] as Id<"questions">[] };
		const idKeys = Object.keys(retiredNormalizeIds) as Array<keyof typeof retiredNormalizeIds>;
		let cursor: string | null = null;
		for (let pages = 1; ; pages++) {
			const page: Infer<typeof retiredNormalizePageResult> = await ctx.runMutation(
				internal.internal.migrations.normalizeRetiredQuestionsPage,
				{ dryRun: args.dryRun, cursor },
			);
			for (const key of countKeys) totals[key] += page[key];
			for (const key of idKeys) {
				ids[key].push(...page[key].slice(0, RETIRED_NORMALIZE_MAX_REPORTED_IDS - ids[key].length));
			}
			if (page.isDone) break;
			// Running totals, so a run that stops partway still shows how far it got.
			if (pages % FINGERPRINT_PROGRESS_LOG_PAGES === 0) console.log(`${label} progress: ${JSON.stringify(totals)}`);
			cursor = page.continueCursor;
		}
		console.log(`${label} total: ${JSON.stringify(totals)}`);
		return { ...totals, ...ids };
	},
});

export const LIBRARY_RETIRE_PAGE_SIZE = 100;
// The run reports the IDs of the first this many questions it retires, for the record, and counts
// the rest.
export const LIBRARY_RETIRE_MAX_REPORTED_IDS = 1000;
export const LIBRARY_RETIRE_MAX_KEPT = 1000;
const libraryRetireCounts = {
	scanned: v.number(),
	// Public library questions found: the ones kept plus the ones retired.
	publicLibrary: v.number(),
	kept: v.number(),
	retired: v.number(),
};
const libraryRetirePageResult = v.object({
	...libraryRetireCounts,
	// Every question the page retired (or would retire), at most a page's worth.
	retiredIds: v.array(v.id("questions")),
	// Kept questions whose status is "approved" or unset: public, but the feed lists only "public".
	keptOutsideFeedIds: v.array(v.id("questions")),
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/** A question the shared library lists: public, and not a personal, team or organization question. */
function isPublicLibraryQuestion(question: Doc<"questions">): boolean {
	return !isUserWrittenQuestion(question) && !isRetiredQuestion(question) && isQuestionPublic(question);
}

/**
 * The questions to keep that aren't public library questions here: missing, retired, not public
 * (waiting for review or taken down), or someone's own.
 */
export const libraryKeepersNotInLibrary = internalQuery({
	args: { keepQuestionIds: v.array(v.id("questions")) },
	returns: v.array(v.id("questions")),
	handler: async (ctx, args) => {
		const notInLibrary: Id<"questions">[] = [];
		for (const questionId of args.keepQuestionIds) {
			const question = await ctx.db.get(questionId);
			if (!question || !isPublicLibraryQuestion(question)) notInLibrary.push(questionId);
		}
		return notInLibrary;
	},
});

/**
 * One page of the library reset. With `dryRun` it writes nothing and reports what a real run
 * would retire. It pages over every question, unfiltered: a filtered paginate can read most of
 * the table to fill one page.
 */
export const retireLibraryExceptPage = internalMutation({
	args: {
		keepQuestionIds: v.array(v.id("questions")),
		dryRun: v.boolean(),
		cursor: v.union(v.string(), v.null()),
		prunedAt: v.number(),
	},
	returns: libraryRetirePageResult,
	handler: async (ctx, args) => {
		const keep = new Set<Id<"questions">>(args.keepQuestionIds);
		const page = await ctx.db.query("questions").paginate({ numItems: LIBRARY_RETIRE_PAGE_SIZE, cursor: args.cursor });
		const counts = { scanned: page.page.length, publicLibrary: 0, kept: 0, retired: 0 };
		const retiredIds: Id<"questions">[] = [];
		const keptOutsideFeedIds: Id<"questions">[] = [];
		for (const question of page.page) {
			if (!isPublicLibraryQuestion(question)) continue;
			counts.publicLibrary += 1;
			if (keep.has(question._id)) {
				counts.kept += 1;
				if (question.status !== "public") keptOutsideFeedIds.push(question._id);
				continue;
			}
			counts.retired += 1;
			retiredIds.push(question._id);
			if (args.dryRun) continue;
			// Retired as approvePruning retires a library question: it keeps its fingerprint, so the
			// same wording isn't generated again, and its embedding, whose filters follow the new
			// status. The revision moves so an admin page loaded before the run can't save over it.
			await ctx.db.patch(question._id, {
				status: "pruned",
				prunedAt: args.prunedAt,
				reviewRevision: (question.reviewRevision ?? 0) + 1,
			});
			await ctx.scheduler.runAfter(0, internal.internal.questions.syncQuestionEmbeddingFilters, { questionId: question._id });
		}
		return { ...counts, retiredIds, keptOutsideFeedIds, continueCursor: page.continueCursor, isDone: page.isDone };
	},
});

// gstack-shortcut(dec-2445166b-925b-41c7-9b0a-085b818d4aff): likes and hides of the questions it retires are dropped by the Liked and Settings pages, upgrade when real users have likes.
// gstack-shortcut(dec-4ea8f5e8-288d-4fdf-b3d3-116cc11b58bb): the backup is the only bulk undo, upgrade when a reset needs partial reversal.
/**
 * Resets the shared library to a list of keepers: every other public library question is retired
 * (status "pruned", one `prunedAt` for the whole run). Personal, team and organization questions,
 * questions waiting for review and questions already retired are left alone. No question is
 * deleted: a retired one keeps its text, fingerprint and embedding, and leaves the feed, the
 * daily email, the schedule and collection pickers, and the pruning and duplicate review lists.
 *
 * It refuses to run unless every question to keep is a public library question on this
 * deployment, so IDs from another deployment, or an empty list, retire nothing. Besides the
 * counts, `retiredIds` lists the IDs (no text) of the first LIBRARY_RETIRE_MAX_REPORTED_IDS
 * questions retired, in table order, and a real run logs each page's IDs with the run's
 * `prunedAt`. Keep that output as the record of what the run changed. Either kind of run also
 * logs how many kept questions have status "approved" or none, with the first ten IDs: they
 * are kept, but the feed lists only status "public".
 *
 * What it doesn't give back, and what to expect after it:
 * - A retired question's link stops opening, in shared links and in emails already sent, until
 *   the question is brought back.
 * - A like or a hide of a question it retires is dropped the next time its owner opens the Liked
 *   or Settings page, and bringing the question back doesn't restore it.
 * - It records no review, so the admin review history can't undo it, and an earlier review of a
 *   question it retires (a pruning decision or a duplicate merge) can no longer be undone.
 * - The undo for a whole run is the backup. One question is brought back at
 *   /admin/questions/<id> by setting its status to public; the questions list shows only the
 *   newest 100.
 * - A question published while it runs is retired too if a later page reaches it.
 * - A pending duplicate group it empties leaves the duplicates page but stays in the admin
 *   dashboard's count.
 * - With a small library the feed and the daily email generate new questions far more often,
 *   and matrix fill and the nightly pool still publish theirs to the library without review.
 *
 * Take a backup, run it with dryRun first (`kept` should be the number of different IDs you
 * passed), then for real, then with dryRun again (`retired` should then be 0); add --prod after
 * `run` for production:
 * `npx convex run internal/migrations:retireLibraryExcept '{"dryRun":true,"keepQuestionIds":["<id>","<id>"]}'`.
 */
export const retireLibraryExcept = internalAction({
	args: { keepQuestionIds: v.array(v.id("questions")), dryRun: v.boolean() },
	returns: v.object({ ...libraryRetireCounts, retiredIds: v.array(v.id("questions")) }),
	handler: async (ctx, args) => {
		const keepQuestionIds = [...new Set(args.keepQuestionIds)];
		if (keepQuestionIds.length === 0 || keepQuestionIds.length > LIBRARY_RETIRE_MAX_KEPT) {
			throw new Error(`Pass between 1 and ${LIBRARY_RETIRE_MAX_KEPT} questions to keep. Nothing was changed.`);
		}
		const notInLibrary: Id<"questions">[] = await ctx.runQuery(internal.internal.migrations.libraryKeepersNotInLibrary, {
			keepQuestionIds,
		});
		if (notInLibrary.length > 0) {
			throw new Error(
				`${notInLibrary.length} of the ${keepQuestionIds.length} questions to keep aren't public library questions on this deployment (${notInLibrary.slice(0, 10).join(", ")}). Nothing was changed.`,
			);
		}

		const label = `retireLibraryExcept${args.dryRun ? " (dry run)" : ""}`;
		const totals = { scanned: 0, publicLibrary: 0, kept: 0, retired: 0 };
		const countKeys = Object.keys(libraryRetireCounts) as Array<keyof typeof libraryRetireCounts>;
		const retiredIds: Id<"questions">[] = [];
		const keptOutsideFeedIds: Id<"questions">[] = [];
		const prunedAt = Date.now();
		let cursor: string | null = null;
		for (;;) {
			const page: Infer<typeof libraryRetirePageResult> = await ctx.runMutation(
				internal.internal.migrations.retireLibraryExceptPage,
				{ keepQuestionIds, dryRun: args.dryRun, cursor, prunedAt },
			);
			for (const key of countKeys) totals[key] += page[key];
			retiredIds.push(...page.retiredIds.slice(0, LIBRARY_RETIRE_MAX_REPORTED_IDS - retiredIds.length));
			// Logged page by page, with the time every row of the run carries, so a run that stops
			// partway still leaves a record of what it retired.
			if (!args.dryRun && page.retiredIds.length > 0) {
				console.log(`${label} retired at prunedAt ${prunedAt}: ${page.retiredIds.join(", ")}`);
			}
			keptOutsideFeedIds.push(...page.keptOutsideFeedIds);
			if (page.isDone) break;
			cursor = page.continueCursor;
		}
		if (keptOutsideFeedIds.length > 0) {
			console.log(
				`${label}: ${keptOutsideFeedIds.length} of the questions kept have status "approved" or none, and the feed lists only status "public" (${keptOutsideFeedIds.slice(0, 10).join(", ")})`,
			);
		}
		console.log(`${label} total: ${JSON.stringify(totals)}`);
		return { ...totals, retiredIds };
	},
});
