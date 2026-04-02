"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { runPersistedQuestionGeneration } from "../lib/generationRunner";

/**
 * Fill all empty cells in the axis matrix by generating AI questions.
 * Each cell = one style × tone × topic combination.
 * Only generates for combos that have zero public questions.
 */
export const fillEmptyCells = action({
	args: {
		styleSlugs: v.array(v.string()),
		toneSlugs: v.array(v.string()),
		topicSlugs: v.array(v.string()),
		countPerCell: v.optional(v.number()),
	},
	returns: v.object({
		totalCells: v.number(),
		filledCells: v.number(),
		totalQuestionsGenerated: v.number(),
		skippedCells: v.number(),
	}),
	handler: async (ctx, args) => {
		const countPerCell = args.countPerCell ?? 3;
		let totalCells = 0;
		let filledCells = 0;
		let skippedCells = 0;
		let totalGenerated = 0;

		// Fetch ALL public questions ONCE, then build a lookup set.
		// This avoids the N+1 limit=1 bug where a random question
		// could belong to a different cell.
		const allPublic = await ctx.runQuery(
			api.core.questions.getPublicQuestions,
			{ limit: 1000 }
		);

		// Build a Set of existing combos: "styleSlug|toneSlug|topicSlug"
		const existingCombos = new Set<string>();
		for (const q of allPublic) {
			const key = `${q.style ?? ""}|${q.tone ?? ""}|${q.topic ?? ""}`;
			existingCombos.add(key);
		}

		for (const styleSlug of args.styleSlugs) {
			for (const toneSlug of args.toneSlugs) {
				for (const topicSlug of args.topicSlugs) {
					totalCells++;

					const comboKey = `${styleSlug}|${toneSlug}|${topicSlug}`;
					if (existingCombos.has(comboKey)) {
						skippedCells++;
						continue;
					}

					try {
						const result = await runPersistedQuestionGeneration(ctx, {
							purpose: "feed",
							styleSlug,
							toneSlug,
							topicSlug,
							batchSize: countPerCell,
						});

						if (result.saveResult.insertedCount > 0) {
							filledCells++;
							totalGenerated += result.saveResult.insertedCount;

							// Mark this combo as filled so we don't double-generate
							existingCombos.add(comboKey);

							console.log(
								`Filled cell: ${styleSlug} × ${toneSlug} × ${topicSlug} → ${result.saveResult.insertedCount} questions`
							);
						} else {
							skippedCells++;
						}
					} catch (err) {
						console.error(`Failed to fill cell: ${styleSlug} × ${toneSlug} × ${topicSlug}`, err);
						skippedCells++;
					}
				}
			}
		}

		return {
			totalCells,
			filledCells,
			totalQuestionsGenerated: totalGenerated,
			skippedCells,
		};
	},
});

/**
 * Generate questions for a single empty cell.
 * Used when a user clicks "Generate" on an individual empty matrix cell.
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
