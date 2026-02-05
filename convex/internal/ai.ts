"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import OpenAI from "openai";
import { api, internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { createPopulateMissingEmbeddingsEmail, createPopulateMissingStyleEmbeddingsEmail, createPopulateMissingToneEmbeddingsEmail } from "../lib/emails";

const openai = new OpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: process.env.OPEN_ROUTER_API_KEY,
	timeout: 30000, // 30 second timeout
	defaultHeaders: {
		'HTTP-Referer': 'https://breaktheiceberg.com',
		'X-Title': 'Break the ice(berg)',
	},
});

export const populateMissingEmbeddings = internalAction({
	args: {
		maxBatchSize: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const questions = await ctx.runQuery(internal.internal.questions.getQuestionsWithMissingEmbeddings);
		let questionsProcessed = 0;
		const questionsMissingEmbeddings = questions.length;
		const errors: string[] = [];
		for (const question of questions) {
			try {
				await ctx.runAction(internal.lib.retriever.embedQuestion, { questionId: question._id });
				questionsProcessed++;
				if (questionsProcessed >= args.maxBatchSize) {
					break;
				}
			} catch (error) {
				errors.push(`Error embedding question ${question._id}: ${error instanceof Error ? error.message : String(error)}`);
				console.error(error);
			}
		}
		const results = {
			questionsProcessed,
			questionsMissingEmbeddings,
			errors,
		};
		if (questionsProcessed > 0 || errors.length > 0) {
			const { subject, html } = createPopulateMissingEmbeddingsEmail(results);
			await ctx.runAction(internal.email.sendEmail, { subject, html });
		}
	},
});

export const populateMissingStyleEmbeddings = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx, args) => {
		const styles = await ctx.runQuery(internal.internal.styles.getStylesWithMissingEmbeddings);
		let stylesProcessed = 0;
		const stylesMissingEmbeddings = styles.length;
		const errors: string[] = [];
		for (const style of styles) {
			try {
				await ctx.runAction(internal.lib.retriever.embedStyle, { styleId: style._id });
				stylesProcessed++;
			} catch (error) {
				errors.push(`Error embedding style ${style._id}: ${error instanceof Error ? error.message : String(error)}`);
				console.error(error);
			}
		}
		const results = {
			stylesProcessed,
			stylesMissingEmbeddings,
			errors,
		};
		if (stylesProcessed > 0 || errors.length > 0) {
			const { subject, html } = createPopulateMissingStyleEmbeddingsEmail(results);
			await ctx.runAction(internal.email.sendEmail, { subject, html });
		}
	},
});

export const populateMissingToneEmbeddings = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx, args) => {
		const tones = await ctx.runQuery(internal.internal.tones.getTonesWithMissingEmbeddings);
		let tonesProcessed = 0;
		const tonesMissingEmbeddings = tones.length;
		const errors: string[] = [];
		for (const tone of tones) {
			try {
				await ctx.runAction(internal.lib.retriever.embedTone, { toneId: tone._id });
				tonesProcessed++;
			} catch (error) {
				errors.push(`Error embedding tone ${tone._id}: ${error instanceof Error ? error.message : String(error)}`);
				console.error(error);
			}
		}
		const results = {
			tonesProcessed,
			tonesMissingEmbeddings,
			errors,
		};
		if (tonesProcessed > 0 || errors.length > 0) {
			const { subject, html } = createPopulateMissingToneEmbeddingsEmail(results);
			await ctx.runAction(internal.email.sendEmail, { subject, html });
		}
	},
});

export const detectDuplicateQuestionsStreaming = internalAction({
	args: {
		threshold: v.optional(v.number()),
	},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx, args): Promise<Id<"duplicateDetectionProgress">> => {
		const threshold = args.threshold ?? 0.95;
		// 1. Initialize progress
		const totalQuestions = await ctx.runQuery(internal.internal.questions.countQuestions);
		const BATCH_SIZE = 50;
		const totalBatches = Math.ceil(totalQuestions / BATCH_SIZE);

		const progressId: Id<"duplicateDetectionProgress"> = await ctx.runMutation(api.admin.duplicates.createDuplicateDetectionProgress, {
			totalQuestions,
			totalBatches,
		});

		// 2. Start processing
		let cursor: string | null = null;
		let processedQuestions = 0;
		let duplicatesFound = 0;
		let currentBatch = 0;
		const errors: string[] = [];

		try {
			do {
				currentBatch++;

				// Fetch batch of questions with embeddings
				const result: { questions: { _id: Id<"questions">, text?: string, embedding?: number[] }[], continueCursor: string, isDone: boolean } =
					await ctx.runQuery(internal.internal.questions.getQuestionsWithEmbeddingsBatch, {
						cursor,
						limit: BATCH_SIZE
					});

				const questions = result.questions;
				cursor = result.continueCursor;
				const isDone = result.isDone;

				// Process this batch
				for (const question of questions) {
					if (!question.embedding || question.embedding.length === 0) continue;

					// Search for similar questions
					const searchResults = await ctx.vectorSearch("questions", "by_embedding", {
						vector: question.embedding,
						limit: 5,
					});

					for (const match of searchResults) {
						if (match._id <= question._id) continue;

						if (match._score > threshold) {
							try {
								const result = await ctx.runMutation(internal.internal.questions.saveDuplicateDetection, {
									questionIds: [question._id, match._id],
									reason: `High embedding similarity (${match._score.toFixed(4)})`,
									confidence: match._score,
								});
								if (result) {
									duplicatesFound++;
								}
							} catch (e) {
								console.error("Error saving duplicate:", e);
							}
						}
					}
				}

				processedQuestions += questions.length;

				// Update progress
				await ctx.runMutation(api.admin.duplicates.updateDuplicateDetectionProgress, {
					progressId,
					processedQuestions,
					currentBatch,
					duplicatesFound,
					errors,
				});

				if (isDone) {
					break;
				}

			} while (cursor);

			await ctx.runMutation(api.admin.duplicates.completeDuplicateDetectionProgress, {
				progressId,
				processedQuestions,
				duplicatesFound,
				errors,
			});

		} catch (error) {
			console.error("Duplicate detection failed:", error);
			errors.push(error instanceof Error ? error.message : String(error));
			await ctx.runMutation(api.admin.duplicates.failDuplicateDetectionProgress, {
				progressId,
				errors,
			});
		}

		return progressId;
	},
});

// Nightly question pool generation - creates a batch of AI questions for daily distribution
// Refactored Nightly Generation with Batching and Structure Enforcement
export const generateNightlyQuestionPool = internalAction({
	args: {
		targetCount: v.number(),        // Questions per style/tone combo
		maxCombinations: v.number(),    // Max combos to process
	},
	returns: v.object({
		questionsGenerated: v.number(),
		combinationsProcessed: v.number(),
		errors: v.array(v.string()),
	}),
	handler: async (ctx, args): Promise<{ questionsGenerated: number; combinationsProcessed: number; errors: string[] }> => {
		const { targetCount, maxCombinations } = args;

		const usersWithLowUnseenCount = await ctx.runQuery(internal.internal.questions.getUsersWithLowUnseenCount, { threshold: 3 });
		if (usersWithLowUnseenCount.length === 0) return { questionsGenerated: 0, combinationsProcessed: 0, errors: [] };

		const today = new Date().toISOString().split('T')[0];
		let questionsGenerated = 0;
		let combinationsProcessed = 0;
		const errors: Array<string> = [];

		let styles: Array<Doc<"styles">> = [];
		let tones: Array<Doc<"tones">> = [];

		if (usersWithLowUnseenCount.length > 3) {
			// Get all styles/tones when many users need questions
			// Using type assertion to Doc since api core queries might strip optional fields
			const stylesResp = await ctx.runQuery(api.core.styles.getStyles, {});
			const tonesResp = await ctx.runQuery(api.core.tones.getTones, {});
			styles = stylesResp as Array<Doc<"styles">>;
			tones = tonesResp as Array<Doc<"tones">>;
		} else {
			// Aggregate visible styles/tones for specific users with low counts
			const allUserStyles = await Promise.all(
				usersWithLowUnseenCount.map(userId =>
					ctx.runQuery(internal.internal.users.getUserVisibleStyles, { userId })
				)
			);
			const allUserTones = await Promise.all(
				usersWithLowUnseenCount.map(userId =>
					ctx.runQuery(internal.internal.users.getUserVisibleTones, { userId })
				)
			);

			// Flatten and de-duplicate by ID to ensure we generate variety across all targeted users
			styles = Array.from(new Map(allUserStyles.flat().map(s => [s._id, s])).values());
			tones = Array.from(new Map(allUserTones.flat().map(t => [t._id, t])).values());
		}
		const topic = await ctx.runQuery(internal.internal.topics.getTopCurrentTopic, {});

		const combinations = styles.flatMap(s => tones.map(t => ({ style: s, tone: t })));

		// Fisher-Yates shuffle
		for (let i = combinations.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[combinations[i], combinations[j]] = [combinations[j], combinations[i]];
		}

		const selectedCombinations = combinations.slice(0, maxCombinations);

		for (const { style, tone } of selectedCombinations) {
			combinationsProcessed++;
			try {
				// We call the AI ONCE per combo to get a batch
				const completion = await openai.chat.completions.create({
					model: "@preset/break-the-ice-berg-default",
					messages: [
						{
							role: "system",
							content: `You are a world-class creative writer specializing in social psychology and ice-breakers.
                            
                            TASK: Generate exactly ${targetCount} unique questions.
                            FORMAT: A JSON array of strings: ["Question 1", "Question 2", ...].
                            STYLE STRUCTURE: You MUST follow this template: "${style.structure}"
                            
                            CONSTRAINTS:
                            - Avoid repeating nouns or verbs across the batch.
                            - Ensure each question explores a different life niche (e.g., social, digital, physical, career).
                            - Do not use the words "Valentine" or "Love" literally unless essential; evoke the feeling instead.`
						},
						{
							role: "user",
							content: `Generate ${targetCount} questions.
                            Style: ${style.name} (${style.description})
                            Tone: ${tone.name} (${tone.description})
                            Topic Focus: ${topic?.name ?? 'General'} (${topic?.description ?? ''})
                            AI Guidance: ${style.promptGuidanceForAI} ${tone.promptGuidanceForAI} ${topic?.promptGuidanceForAI ?? ''}`
						}
					],
					response_format: { type: "json_object" }, // Ensures valid JSON
					temperature: 0.85, // Balanced for structure vs creativity
					max_tokens: 150 * targetCount,
				});

				const content = completion.choices[0]?.message?.content ?? "{}";
				let parsed;
				try {
					parsed = JSON.parse(content);
				} catch (e) {
					console.error("Failed to parse AI response:", content);
					throw new Error("Invalid JSON from AI");
				}

				let batch: string[] = [];
				if (Array.isArray(parsed)) {
					if (parsed.every(item => typeof item === "string")) {
						batch = parsed;
					}
				} else if (typeof parsed === "object" && parsed !== null) {
					const firstValue = Object.values(parsed)[0];
					if (Array.isArray(firstValue) && firstValue.every(item => typeof item === "string")) {
						batch = firstValue;
					}
				}

				if (batch.length === 0) {
					console.warn("AI returned an empty or invalid batch format:", parsed);
				}

				for (const text of batch) {
					const cleanedText = text.replace(/^["']|["']$/g, '').trim();

					// 1. Exact Match Check (O(1) via Index)
					const isDuplicate = await ctx.runQuery(internal.internal.questions.checkExactDuplicate, { text: cleanedText });
					if (isDuplicate) continue;

					// 2. Vector Similarity Check (Semantic redundancy)
					const isSimilar = await ctx.runAction(internal.internal.questions.checkSimilarity, { text: cleanedText });
					if (isSimilar) continue;

					const savedId = await ctx.runMutation(internal.internal.questions.savePoolQuestion, {
						text: cleanedText,
						styleId: style._id,
						style: style.id,
						toneId: tone._id,
						tone: tone.id,
						poolDate: today,
					});

					if (savedId) {
						questionsGenerated++;
						await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, { questionId: savedId });
					}
				}
				// Small delay to respect rate limits between combo batches
				await new Promise(r => setTimeout(r, 500));

			} catch (error: any) {
				errors.push(`Combo ${style.id}/${tone.id} failed: ${error.message}`);
			}
		}

		// ... (Summary Email Logic)
		return { questionsGenerated, combinationsProcessed, errors };
	},
});

// Remix a single question - alters the words while keeping the same style, tone, and vibe
export const remixQuestion = internalAction({
	args: {
		questionId: v.id("questions"),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		const question = await ctx.runQuery(internal.internal.questions.getQuestionById, { id: args.questionId });
		if (!question || !question.text) {
			throw new Error("Question not found or has no text");
		}

		const [style, tone, topic] = await Promise.all([
			question.styleId ? ctx.runQuery(internal.internal.styles.getStyleById, { id: question.styleId }) : null,
			question.toneId ? ctx.runQuery(internal.internal.tones.getToneById, { id: question.toneId }) : null,
			ctx.runQuery(internal.internal.topics.getTopCurrentTopic, {}),
		]);

		const completion = await openai.chat.completions.create({
			model: "@preset/break-the-ice-berg-default",
			messages: [
				{
					role: "system",
					content: `You are a world-class creative writer specializing in social psychology and ice-breakers.
					
					TASK: "Remix" the user's question. Change the words and phrasing completely, but keep the EXACT SAME style, tone, and topic vibe.
					FORMAT: Return ONLY the new question text as a plain string. No quotes, no JSON, no prefixes.
					
					STYLE STRUCTURE: Use this as your base: "${style?.structure ?? "Direct and engaging"}"`
				},
				{
					role: "user",
					content: `Remix this question: "${question.text}"
					
					Context:
					Style: ${style?.name ?? "General"} (${style?.description ?? ""})
					Tone: ${tone?.name ?? "General"} (${tone?.description ?? ""})
					Topic Focus: ${topic?.name ?? "General"} (${topic?.description ?? ""})`
				}
			],
			temperature: 0.9,
			max_tokens: 150,
		});

		const remixedText = completion.choices[0]?.message?.content?.trim() ?? "";
		if (!remixedText) {
			throw new Error("AI failed to generate a remix");
		}

		return remixedText.replace(/^["']|["']$/g, '').trim();
	},
});
