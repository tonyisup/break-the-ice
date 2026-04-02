"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { runPersistedQuestionGeneration } from "../lib/generationRunner";

const axisValidator = v.union(
	v.literal("style"),
	v.literal("tone"),
	v.literal("topic"),
);

function questionMatchesMatrixCell(
	q: { style?: string | null; tone?: string | null; topic?: string | null },
	axisY: "style" | "tone" | "topic",
	axisX: "style" | "tone" | "topic",
	ySlug: string,
	xSlug: string,
): boolean {
	const qY = axisY === "style" ? q.style : axisY === "tone" ? q.tone : q.topic;
	const qX = axisX === "style" ? q.style : axisX === "tone" ? q.tone : q.topic;
	return qY === ySlug && qX === xSlug;
}

/** Helper: check if a cell (styleSlug × toneSlug × topicSlug) already has >= maxCount public questions */
async function cellHasEnough(
	ctx: any,
	styleSlug: string,
	toneSlug: string,
	topicSlug: string | undefined,
	maxCount: number,
): Promise<boolean> {
	const comboKey = `${styleSlug}|${toneSlug}|${topicSlug ?? ""}`;
	let found = 0;
	// Scan public questions in batches (limit 5000 per call, should cover most setups)
	const allPublic = await ctx.runQuery(
		api.core.questions.getPublicQuestions,
		{ limit: 5000 }
	);
	for (const q of allPublic) {
		const qKey = `${q.style ?? ""}|${q.tone ?? ""}|${q.topic ?? ""}`;
		if (qKey === comboKey) {
			found++;
			if (found >= maxCount) return true;
		}
	}
	return false;
}

/**
 * Fill empty cells on the 2D schedule matrix (one generation per visible cell).
 * Each entry matches how the UI buckets questions: same axis-Y slug and axis-X slug,
 * regardless of the third taxonomy dimension.
 */
export const fillEmptyCells = action({
	args: {
		axisY: axisValidator,
		axisX: axisValidator,
		cells: v.array(
			v.object({
				ySlug: v.string(),
				xSlug: v.string(),
				styleSlug: v.string(),
				toneSlug: v.string(),
				topicSlug: v.optional(v.string()),
			}),
		),
		countPerCell: v.optional(v.number()),
	},
	returns: v.object({
		totalCells: v.number(),
		filledCells: v.number(),
		totalQuestionsGenerated: v.number(),
		skippedExisting: v.number(),       // cell already has questions
		skippedInvalidTaxonomy: v.number(), // slug doesn't resolve to active entry
	}),
	handler: async (ctx, args) => {
		const countPerCell = args.countPerCell ?? 1;
		let totalCells = 0;
		let filledCells = 0;
		let skippedExisting = 0;
		let skippedInvalidTaxonomy = 0;
		let totalGenerated = 0;

		const allPublic = await ctx.runQuery(
			api.core.questions.getPublicQuestions,
			{ limit: 5000 }
		);

		for (const cell of args.cells) {
			totalCells++;

			const hasAnyInCell = allPublic.some((q) =>
				questionMatchesMatrixCell(q, args.axisY, args.axisX, cell.ySlug, cell.xSlug),
			);
			if (hasAnyInCell) {
				skippedExisting++;
				continue;
			}

			try {
				const result = await runPersistedQuestionGeneration(ctx, {
					purpose: "feed",
					styleSlug: cell.styleSlug,
					toneSlug: cell.toneSlug,
					topicSlug: cell.topicSlug,
					batchSize: countPerCell,
				});

				if (result.saveResult.insertedCount > 0) {
					filledCells++;
					totalGenerated += result.saveResult.insertedCount;
					console.log(
						`Filled matrix cell (${args.axisY}=${cell.ySlug}, ${args.axisX}=${cell.xSlug}) → ${result.saveResult.insertedCount} questions`,
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
 * Guarded: skips if the cell already has 5+ questions.
 */
export const fillSingleCell = action({
	args: {
		styleSlug: v.string(),
		toneSlug: v.string(),
		topicSlug: v.optional(v.string()),
		count: v.optional(v.number()),
	},
	returns: v.object({
		count: v.number(),
		questionIds: v.array(v.id("questions")),
	}),
	handler: async (ctx, args) => {
		// Hard guard: don't generate if cell already has 5+ questions
		if (await cellHasEnough(ctx, args.styleSlug, args.toneSlug, args.topicSlug, 5)) {
			return { count: 0, questionIds: [] };
		}

		const result = await runPersistedQuestionGeneration(ctx, {
			purpose: "feed",
			styleSlug: args.styleSlug,
			toneSlug: args.toneSlug,
			topicSlug: args.topicSlug,
			batchSize: args.count ?? 3,
		});

		return {
			count: result.saveResult.insertedCount,
			questionIds: result.saveResult.insertedQuestionIds,
		};
	},
});
