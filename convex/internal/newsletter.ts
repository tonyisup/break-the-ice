"use node"

import { internalAction, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const getQuestionForUser = internalAction({
	args: { email: v.string() },
	returns: v.object({
		success: v.boolean(),
		question: v.string(),
		questionUrl: v.string(),
		imageUrl: v.string(),
		unsubscribeUrl: v.string(),
		email: v.string(),
	}),
	handler: async (ctx, args): Promise<{
		success: boolean;
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

		let question: Doc<"questions"> | null = null;

		// 1. Get exclusion lists: sent questions, hidden questions, hidden styles, hidden tones
		const sentQuestionIds: Id<"questions">[] = await ctx.runQuery(
			internal.internal.questions.getSentQuestionsForUser,
			{ userId: user._id }
		);

		const hiddenStyles: any[] = await ctx.runQuery(
			internal.internal.users.getUserHiddenStyles,
			{ userId: user._id }
		);
		const hiddenTones: any[] = await ctx.runQuery(
			internal.internal.users.getUserHiddenTones,
			{ userId: user._id }
		);

		const excludedQuestionIds = new Set<string>(
			sentQuestionIds.map(id => id.toString())
		);
		const excludedStyleIds = new Set<string>(
			hiddenStyles.map((s: any) => s.styleId.toString())
		);
		const excludedToneIds = new Set<string>(
			hiddenTones.map((t: any) => t.toneId.toString())
		);

		const unseenQuestionIds = await ctx.runQuery(
			internal.internal.questions.getUnseenQuestionIdsForUser,
			{ userId: user._id }
		);

		if (unseenQuestionIds.length > 0) {
			question = await ctx.runQuery(internal.internal.questions.getQuestionById, {
				id: unseenQuestionIds[0],
			});
		}
		else {
		// 2. If the user has a preference embedding, find the most similar valid question
			if (user.questionPreferenceEmbedding && user.questionPreferenceEmbedding.length > 0) {
				const MAX_CANDIDATES = 100;

				const results = await ctx.vectorSearch("questions", "by_embedding", {
					vector: user.questionPreferenceEmbedding,
					limit: MAX_CANDIDATES,
					filter: (q) => q.eq("status", "public"),
				});

				if (results.length > 0) {
					const candidateIds = results.map(r => r._id);
					for (const candidateId of candidateIds) {
						if (excludedQuestionIds.size > 0 && excludedQuestionIds.has(candidateId.toString())) continue;

						const candidate: Doc<"questions"> | null = await ctx.runQuery(
							internal.internal.questions.getQuestionById,
							{ id: candidateId }
						);

						if (!candidate) continue;
						if (!candidate.text) continue;
						if (candidate.prunedAt !== undefined) continue;
						if (candidate.status !== "approved" && candidate.status !== "public" && candidate.status !== undefined) continue;
						if (candidate.styleId && excludedStyleIds.has(candidate.styleId.toString())) continue;
						if (candidate.toneId && excludedToneIds.has(candidate.toneId.toString())) continue;

						// Found a valid question
						question = candidate;
						break;
					}
				}
			}
		}

		// 3. If no valid question found via embedding search, generate one via AI
		if (!question) {
			try {
				const questions = await ctx.runAction(
					api.core.ai.generateAIQuestionForNewsletter,
					{
						userId: user._id
					}
				);
				if (questions.length == 0) {
					throw new Error("Could not generate a question.");
				}
				question = questions[0];
			} catch (error) {
				console.error("Failed to generate AI question for newsletter:", error);
			}
		}

		if (!question) {
			throw new Error("Could not find or generate a question.");
		}

		await ctx.runMutation(internal.internal.questions.markUserQuestionAsSent, {
			userId: user._id,
			questionId: question._id,
		});

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://breaktheiceberg.com/";


		const questionText: string = question.text || question.customText || "";
		return {
			success: true,
			question: questionText,
			questionUrl: `${baseUrl}question/${question._id}`,
			imageUrl: `${baseUrl}api/og?id=${question._id}`,
			unsubscribeUrl: `${baseUrl}unsubscribe?email=${encodeURIComponent(args.email)}`,
			email: args.email,
		};
	},
});
