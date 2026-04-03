import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

type ZombieEntry = {
	slug: string;
	type: "style" | "tone" | "topic";
	count: number;
};

const PUBLIC_QUESTION_PAGE_SIZE = 1000;

const zombieEntryValidator = v.object({
	slug: v.string(),
	type: v.union(v.literal("style"), v.literal("tone"), v.literal("topic")),
	count: v.number(),
});

/** Internal query: scan all public questions for orphan slugs */
export const scanZombieSlugs = internalQuery({
	args: {},
	returns: v.object({
		zombies: v.array(zombieEntryValidator),
		uniqueAffectedQuestions: v.number(),
	}),
	handler: async (ctx) => {
		const slugSet = new Map<string, { type: "style" | "tone" | "topic"; count: number }>();

		const bumpSlug = (
			slug: string | undefined,
			type: "style" | "tone" | "topic",
		) => {
			if (!slug) return;
			const key = `${type}:${slug}`;
			if (!slugSet.has(key)) {
				slugSet.set(key, { type, count: 0 });
			}
			slugSet.get(key)!.count++;
		};

		let cursor: string | null = null;
		let done = false;
		do {
			const r = await ctx.db
				.query("questions")
				.withIndex("by_status", (q) => q.eq("status", "public"))
				.paginate({ numItems: PUBLIC_QUESTION_PAGE_SIZE, cursor });
			for (const row of r.page) {
				bumpSlug(row.style, "style");
				bumpSlug(row.tone, "tone");
				bumpSlug(row.topic, "topic");
			}
			done = r.isDone;
			cursor = r.continueCursor;
		} while (!done);

		const zombies: ZombieEntry[] = [];

		for (const [key, info] of slugSet) {
			const slug = key.split(":").slice(1).join(":");
			let active: unknown = null;

			if (info.type === "style") {
				active = await ctx.db
					.query("styles")
					.withIndex("by_slug_status", (q) =>
						q.eq("slug", slug).eq("status", "active"),
					)
					.first();
			} else if (info.type === "tone") {
				active = await ctx.db
					.query("tones")
					.withIndex("by_slug_status", (q) =>
						q.eq("slug", slug).eq("status", "active"),
					)
					.first();
			} else {
				active = await ctx.db
					.query("topics")
					.withIndex("by_slug_status", (q) =>
						q.eq("slug", slug).eq("status", "active"),
					)
					.first();
			}

			if (!active) {
				zombies.push({ slug, type: info.type, count: info.count });
			}
		}

		zombies.sort((a, b) => b.count - a.count);

		const zombieKeys = new Set(zombies.map((z) => `${z.type}:${z.slug}`));
		const touchesZombie = (row: Doc<"questions">) =>
			(row.style !== undefined &&
				row.style !== "" &&
				zombieKeys.has(`style:${row.style}`)) ||
			(row.tone !== undefined &&
				row.tone !== "" &&
				zombieKeys.has(`tone:${row.tone}`)) ||
			(row.topic !== undefined &&
				row.topic !== "" &&
				zombieKeys.has(`topic:${row.topic}`));

		const uniqueAffected = new Set<Id<"questions">>();
		cursor = null;
		done = false;
		do {
			const r = await ctx.db
				.query("questions")
				.withIndex("by_status", (q) => q.eq("status", "public"))
				.paginate({ numItems: PUBLIC_QUESTION_PAGE_SIZE, cursor });
			for (const row of r.page) {
				if (touchesZombie(row)) {
					uniqueAffected.add(row._id);
				}
			}
			done = r.isDone;
			cursor = r.continueCursor;
		} while (!done);

		return {
			zombies,
			uniqueAffectedQuestions: uniqueAffected.size,
		};
	},
});

/** Cron entry point: run scan, store report, log summary */
export const runZombieSlugScan = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const { zombies, uniqueAffectedQuestions } = await ctx.runQuery(
			internal.admin.zombieSlugs.scanZombieSlugs,
			{}
		);

		await ctx.runMutation(
			internal.admin.zombieSlugs.storeReport,
			{
				scanTime: Date.now(),
				totalZombieSlugs: zombies.length,
				totalAffectedQuestions: uniqueAffectedQuestions,
				details: zombies.map((z: { slug: string; type: string; count: number }) => ({
					slug: z.slug,
					type: z.type,
					count: z.count,
				})),
			}
		);

		if (zombies.length > 0) {
			console.warn(
				`🧟 ${zombies.length} zombie slug kinds (${uniqueAffectedQuestions} unique questions with at least one orphan slug):\n` +
				zombies.map((z: { slug: string; type: string; count: number }) => `  • ${z.slug} (${z.type}) → ${z.count} references`).join("\n")
			);
		} else {
			console.log("✅ Zombie slug scan: no orphans found");
		}

		return null;
	},
});

/** Store the scan result */
export const storeReport = internalMutation({
	args: {
		scanTime: v.number(),
		totalZombieSlugs: v.number(),
		totalAffectedQuestions: v.number(),
		details: v.array(v.object({
			slug: v.string(),
			type: v.string(),
			count: v.number(),
		})),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { details, ...summary } = args;
		const existing = await ctx.db.query("zombieSlugReports").first();

		let reportId: Id<"zombieSlugReports">;

		if (existing) {
			while (true) {
				const batch = await ctx.db
					.query("zombieSlugReportDetails")
					.withIndex("by_reportId", (q) => q.eq("reportId", existing._id))
					.take(100);
				if (batch.length === 0) break;
				for (const row of batch) {
					await ctx.db.delete(row._id);
				}
			}
			// replace (not patch) drops legacy embedded `details` on the summary row
			await ctx.db.replace(existing._id, summary);
			reportId = existing._id;
		} else {
			reportId = await ctx.db.insert("zombieSlugReports", summary);
		}

		for (const d of details) {
			await ctx.db.insert("zombieSlugReportDetails", {
				reportId,
				slug: d.slug,
				type: d.type,
				count: d.count,
			});
		}
		return null;
	},
});

/** Admin query: latest report */
export const getLatestZombieReport = internalQuery({
	args: {},
	returns: v.union(
		v.object({
			scanTime: v.number(),
			totalZombieSlugs: v.number(),
			totalAffectedQuestions: v.number(),
			details: v.array(v.object({
				slug: v.string(),
				type: v.string(),
				count: v.number(),
			})),
		}),
		v.null()
	),
	handler: async (ctx) => {
		const report = await ctx.db.query("zombieSlugReports").order("desc").first();
		if (!report) return null;
		const details = await ctx.db
			.query("zombieSlugReportDetails")
			.withIndex("by_reportId", (q) => q.eq("reportId", report._id))
			.take(5000);
		return {
			scanTime: report.scanTime,
			totalZombieSlugs: report.totalZombieSlugs,
			totalAffectedQuestions: report.totalAffectedQuestions,
			details: details.map((d) => ({
				slug: d.slug,
				type: d.type,
				count: d.count,
			})),
		};
	},
});