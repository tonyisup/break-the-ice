import { v, type Infer } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isQuestionPublic } from "../lib/questionAccess";
import { settleDuplicateGroup } from "../lib/questionReferences";
import { defaultIdealPromptLength, defaultQualityRubric, defaultToneAxesValue } from "../lib/taxonomy";
import { DEFAULT_BLUEPRINT_SLUG, fingerprintText } from "../lib/promptArchitecture";

const PROMPT_BACKFILL_BATCH_SIZE = 100;

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
			const questions = await ctx.db
				.query("questions")
				.filter((q) =>
					q.or(
						q.eq(q.field("styleSlug"), undefined),
						q.eq(q.field("toneSlug"), undefined),
						q.eq(q.field("styleVersion"), undefined),
						q.eq(q.field("toneVersion"), undefined),
						q.eq(q.field("fingerprint"), undefined),
						q.eq(q.field("source"), undefined),
						q.eq(q.field("safetyFlags"), undefined),
						q.eq(q.field("quality"), undefined),
					),
				)
				.take(PROMPT_BACKFILL_BATCH_SIZE);
			for (const question of questions) {
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
			nextStage = questions.length === PROMPT_BACKFILL_BATCH_SIZE ? "questions" : "blueprints";
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
	// Each public library question's fingerprint once the page is done, for the collision report.
	live: v.array(v.object({ ...fingerprintCollisionQuestion.fields, fingerprint: v.string() })),
	continueCursor: v.string(),
	isDone: v.boolean(),
});

/**
 * A personal question, team prompt or organization question that isn't public. It isn't a
 * library question, so the recompute neither rewrites nor lists it, even where it has a
 * fingerprint (an older backfill and admin reviews give some one).
 */
function isPrivateUserQuestion(question: Doc<"questions">) {
	const userWritten = question.authorId !== undefined || question.kind !== undefined || question.organizationId !== undefined;
	return userWritten && !isQuestionPublic(question);
}

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
			if (isQuestionPublic(question) && question.status !== "pruned" && question.prunedAt === undefined) {
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
 * text to fingerprint are counted and left alone. Until it has run after the quote fix deploys,
 * generation can save copies of curly-quoted library questions, so run it soon after deploying
 * (on dev too, before evals).
 *
 * `collisionGroups` counts the fingerprints that two or more public, unpruned library questions
 * share after the run. `collisions` lists the first FINGERPRINT_MAX_REPORTED_COLLISIONS of them,
 * each with its `size` and up to FINGERPRINT_MAX_REPORTED_GROUP_MEMBERS questions (IDs, status
 * and organization, no text), oldest first. A fingerprint is a short hash, so compare the
 * wording before treating a group as duplicates. Generation treats any of them as the existing
 * copy, so nothing breaks if they stay. Retire copies on the admin duplicates page, which keeps
 * their links working; pruning one on the questions page breaks them.
 *
 * A run is safe to repeat. A fingerprint can go stale again later (an undo can restore an old
 * one, and a question that was private during a run can be published without a text change),
 * and a copy held for review isn't listed until it's approved, so check later dry runs for
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
