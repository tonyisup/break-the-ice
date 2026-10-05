"use node"

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import * as crypto from "crypto";

const TRAILING_SLASHES_PATTERN = /\/{2,}$/;
const NEWSLETTER_PICK_ATTEMPTS = 3;

/**
 * Picks the daily email's question: an unseen one, else the closest eligible match to the
 * reader's taste, else a new AI question. Every path skips questions that no longer exist.
 */
async function pickNewsletterQuestion(ctx: ActionCtx, userId: Id<"users">): Promise<Doc<"questions"> | null> {
	let question: Doc<"questions"> | null = null;

	const unseenQuestionIds = await ctx.runQuery(
		internal.internal.questions.getUnseenQuestionIdsForUser,
		{
			userId,
			count: 1
		}
	);

	if (unseenQuestionIds.length > 0) {
		question = await ctx.runQuery(internal.internal.questions.getQuestionById, {
			id: unseenQuestionIds[0],
		});
	} else {
		// 1. Get questions already sent through the newsletter.
		const sentQuestionIds: Id<"questions">[] = await ctx.runQuery(
			internal.internal.questions.getSentQuestionsForUser,
			{ userId },
		);

		// 2. If the user has a preference embedding, find the most similar valid question
		const userEmb = await ctx.runQuery(internal.internal.users.getUserEmbedding, { userId });
		if (userEmb && userEmb.length > 0) {
			// gstack-shortcut(dec-55096c6c-b5ad-48e3-a302-c3949f4b2969): the search isn't filtered to live questions, so retired ones crowd keepers out of the candidates, upgrade when subscribers arrive or keepers should be emailed first.
			const MAX_CANDIDATES = 100;

			const results = await ctx.vectorSearch("question_embeddings", "by_embedding", {
				vector: userEmb,
				limit: MAX_CANDIDATES,
			});

			if (results.length > 0) {
				const candidateIds = await ctx.runQuery(
					internal.internal.questions.getQuestionIdsByEmbeddingRowIds,
					{ embeddingRowIds: results.map((r) => r._id) },
				);
				question = await ctx.runQuery(
					internal.internal.questions.getFirstEligibleNewsletterQuestionForUser,
					{
						userId,
						questionIds: candidateIds.filter(
							(candidateId): candidateId is Id<"questions"> => candidateId !== null,
						),
						excludedQuestionIds: sentQuestionIds,
					},
				);
			}
		}
	}

	// 3. If no valid question found via embedding search, generate one via AI
	if (!question) {
		try {
			const questions = await ctx.runAction(
				internal.internal.ai.generateAIQuestionForUser,
				{
					userId,
					bypassAIUsage: true,
					purpose: "newsletter",
				}
			);
			if (questions.length === 0) {
				throw new Error("Could not generate a question.");
			}
			question = questions[0];
		} catch (error) {
			console.error("Failed to generate AI question for newsletter:", error);
		}
	}

	return question;
}

/**
 * Picks until a question is marked sent. A question can be deleted between being picked and
 * being marked; picking again skips it, so the reader still gets an email that day.
 */
export async function pickUntilMarked<T>(
	pick: () => Promise<T | null>,
	mark: (picked: T) => Promise<boolean>,
	attempts: number,
): Promise<T> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		const picked = await pick();
		if (!picked) {
			throw new Error("Could not find or generate a question.");
		}
		if (await mark(picked)) return picked;
	}
	throw new Error("Every question picked for this email was deleted before it went out.");
}

export const getQuestionForUser = internalAction({
	args: { email: v.string() },
	returns: v.object({
		success: v.boolean(),
		questionId: v.id("questions"),
		question: v.string(),
		questionUrl: v.string(),
		imageUrl: v.string(),
		unsubscribeUrl: v.string(),
		email: v.string(),
	}),
	handler: async (ctx, args): Promise<{
		success: boolean;
		questionId: Id<"questions">;
		question: string;
		questionUrl: string;
		imageUrl: string;
		unsubscribeUrl: string;
		email: string;
	}> => {
		// 1. Get user and their preferences
		const user: Doc<"users"> | null = await ctx.runQuery(internal.internal.users.getUserByEmail, { email: args.email });

		if (!user) {
			throw new Error("User not found.");
		}

		const question = await pickUntilMarked(
			() => pickNewsletterQuestion(ctx, user._id),
			(picked) =>
				ctx.runMutation(internal.internal.questions.markUserQuestionAsSent, {
					userId: user._id,
					questionId: picked._id,
				}),
			NEWSLETTER_PICK_ATTEMPTS,
		);

		const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://breaktheiceberg.com"}/`
			.replace(TRAILING_SLASHES_PATTERN, "/");
		const unsubscribeToken = await ctx.runMutation(
			internal.internal.users.ensureNewsletterUnsubscribeToken,
			{
				userId: user._id,
				token: crypto.randomUUID(),
			},
		);
		const questionText: string = question.text || question.customText || "";
		return {
			success: true,
			questionId: question._id,
			question: questionText,
			questionUrl: `${baseUrl}question/${question._id}`,
			imageUrl: `${baseUrl}api/og?id=${question._id}`,
			unsubscribeUrl: `${baseUrl}unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
			email: args.email,
		};
	}
});
