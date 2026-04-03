"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runPersistedQuestionGeneration } from "../lib/generationRunner";

const axisValidator = v.union(
	v.literal("style"),
	v.literal("tone"),
	v.literal("topic"),
);

const PAGE_SIZE = 256;

type MatrixKeysPage = {
	keys: string[];
	isDone: boolean;
	continueCursor: string | null;
};

type SlugTriplePage = {
	found: boolean;
	isDone: boolean;
	continueCursor: string | null;
};

async function collectMatrixOccupiedKeys(
	ctx: ActionCtx,
	axisY: "style" | "tone" | "topic",
	axisX: "style" | "tone" | "topic",
	topicSlug: string | undefined,
): Promise<Set<string>> {
	const occupied = new Set<string>();
	for (const status of ["public", "approved"] as const) {
		let cursor: string | null = null;
		let done = false;
		do {
			const page: MatrixKeysPage = await ctx.runQuery(
				internal.core.questions.pageQuestionMatrixCellKeys,
				{
					status,
					axisY,
					axisX,
					topicSlug,
					paginationOpts: { numItems: PAGE_SIZE, cursor },
				},
			);
			for (const k of page.keys) {
				occupied.add(k);
			}
			done = page.isDone;
			cursor = page.continueCursor;
		} while (!done);
	}
	return occupied;
}

async function publicSlugTripleExists(
	ctx: ActionCtx,
	args: { styleSlug: string; toneSlug: string; topicSlug?: string },
): Promise<boolean> {
	for (const status of ["public", "approved"] as const) {
		let cursor: string | null = null;
		let done = false;
		do {
			const page: SlugTriplePage = await ctx.runQuery(
				internal.core.questions.pageQuestionsMatchingSlugTriple,
				{
					status,
					styleSlug: args.styleSlug,
					toneSlug: args.toneSlug,
					topicSlug: args.topicSlug,
					paginationOpts: { numItems: PAGE_SIZE, cursor },
				},
			);
			if (page.found) {
				return true;
			}
			done = page.isDone;
			cursor = page.continueCursor;
		} while (!done);
	}
	return false;
}

/**
 * Fill empty cells on the 2D schedule matrix (one generation per visible cell).
 * Each entry matches how the UI buckets questions: same axis-Y slug and axis-X slug,
 * with a shared topic for ALL cells (or random if topicSlug is omitted).
 */
export const fillEmptyCells = action({
	args: {
		organizationId: v.id("organizations"),
		axisY: axisValidator,
		axisX: axisValidator,
		cells: v.array(
			v.object({
				ySlug: v.string(),
				xSlug: v.string(),
				styleSlug: v.string(),
				toneSlug: v.string(),
			}),
		),
		/** Optional: one topic applied to EVERY cell. If omitted, each cell gets a random topic. */
		topicSlug: v.optional(v.string()),
		countPerCell: v.optional(v.number()),
	},
	returns: v.object({
		totalCells: v.number(),
		filledCells: v.number(),
		totalQuestionsGenerated: v.number(),
		skippedExisting: v.number(),
		skippedInvalidTaxonomy: v.number(),
	}),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity?.tokenIdentifier) {
			throw new Error("Not authenticated");
		}
		await ctx.runQuery(api.core.organizations.assertOrgMembershipForCurrentUser, {
			organizationId: args.organizationId,
		});

		const countPerCell = args.countPerCell ?? 1;
		let totalCells = 0;
		let filledCells = 0;
		let skippedExisting = 0;
		let skippedInvalidTaxonomy = 0;
		let totalGenerated = 0;

		const occupied = await collectMatrixOccupiedKeys(
			ctx,
			args.axisY,
			args.axisX,
			args.topicSlug,
		);

		for (const cell of args.cells) {
			totalCells++;

			const effectiveTopic = args.topicSlug;

			const cellKey = `${cell.ySlug}|${cell.xSlug}`;
			if (occupied.has(cellKey)) {
				skippedExisting++;
				continue;
			}

			try {
				const result = await runPersistedQuestionGeneration(ctx, {
					purpose: "feed",
					styleSlug: cell.styleSlug,
					toneSlug: cell.toneSlug,
					topicSlug: effectiveTopic,
					batchSize: countPerCell,
				});

				if (result.saveResult.insertedCount > 0) {
					filledCells++;
					totalGenerated += result.saveResult.insertedCount;
					occupied.add(cellKey);
					console.log(
						`Filled matrix cell (${args.axisY}=${cell.ySlug}, ${args.axisX}=${cell.xSlug}, topic=${effectiveTopic ?? "random"}) → ${result.saveResult.insertedCount} questions`,
					);
				} else {
					skippedExisting++;
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("No active") && msg.includes("entry found for slug")) {
					skippedInvalidTaxonomy++;
					console.warn(
						`Skipped (invalid taxonomy): (${args.axisY}=${cell.ySlug}, ${args.axisX}=${cell.xSlug}) — ${msg}`,
					);
				} else {
					console.error(
						`Failed to fill cell: (${args.axisY}=${cell.ySlug}, ${args.axisX}=${cell.xSlug})`,
						err,
					);
				}
			}
		}

		return {
			totalCells,
			filledCells,
			totalQuestionsGenerated: totalGenerated,
			skippedExisting,
			skippedInvalidTaxonomy,
		};
	},
});

/**
 * Generate questions for a single cell.
 * Guarded: skips if the cell already has questions.
 */
export const fillSingleCell = action({
	args: {
		organizationId: v.id("organizations"),
		styleSlug: v.string(),
		toneSlug: v.string(),
		topicSlug: v.optional(v.string()),
		count: v.optional(v.number()),
	},
	returns: v.object({
		count: v.number(),
		questionIds: v.array(v.id("questions")),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{ count: number; questionIds: Id<"questions">[] }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity?.tokenIdentifier) {
			throw new Error("Not authenticated");
		}
		await ctx.runQuery(api.core.organizations.assertOrgMembershipForCurrentUser, {
			organizationId: args.organizationId,
		});

		if (await publicSlugTripleExists(ctx, args)) {
			return { count: 0, questionIds: [] };
		}

		const result = await runPersistedQuestionGeneration(ctx, {
			purpose: "feed",
			styleSlug: args.styleSlug,
			toneSlug: args.toneSlug,
			topicSlug: args.topicSlug,
			batchSize: args.count ?? 1,
		});

		return {
			count: result.saveResult.insertedCount,
			questionIds: result.saveResult.insertedQuestionIds,
		};
	},
});
