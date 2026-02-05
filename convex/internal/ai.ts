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
export const generateNightlyQuestionPool = internalAction({
	args: {
		targetCount: v.number(),        // Questions per style/tone combo
		maxCombinations: v.number(),    // Max combos to process (avoid timeout)
	},
	returns: v.object({
		questionsGenerated: v.number(),
		combinationsProcessed: v.number(),
		errors: v.array(v.string()),
	}),
	handler: async (ctx, args) => {
		const { targetCount, maxCombinations } = args;

		// Check if we need to generate questions
		const needsQuestions = await ctx.runQuery(internal.internal.questions.hasUsersWithLowUnseenCount, { threshold: 3 });
		if (!needsQuestions) {
			console.log("Skipping nightly pool generation: All users have enough unseen questions.");
			return {
				questionsGenerated: 0,
				combinationsProcessed: 0,
				errors: [],
			};
		}

		const today = new Date().toISOString().split('T')[0];

		let questionsGenerated = 0;
		let combinationsProcessed = 0;
		const errors: Array<string> = [];

		// Get all styles and tones
		const styles: Array<Doc<"styles">> = await ctx.runQuery(api.core.styles.getStyles, {});
		const tones: Array<Doc<"tones">> = await ctx.runQuery(api.core.tones.getTones, {});

		// Create all combinations
		const combinations: Array<{ style: Doc<"styles">, tone: Doc<"tones"> }> = [];
		for (const style of styles) {
			for (const tone of tones) {
				combinations.push({ style, tone });
			}
		}

		// Shuffle to ensure variety across runs
		for (let i = combinations.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[combinations[i], combinations[j]] = [combinations[j], combinations[i]];
		}

		// Process limited combinations to avoid timeout
		const toProcess = combinations.slice(0, maxCombinations);

		for (const { style, tone } of toProcess) {
			combinationsProcessed++;

			try {
				// Generate questions for this combo
				const stylePrompt = `${style.name} - ${style.description || ''} ${style.promptGuidanceForAI || ''}`;
				const tonePrompt = `${tone.name} - ${tone.description || ''} ${tone.promptGuidanceForAI || ''}`;

				// Track generated questions for this specific combination to ensure variety
				const questionsGeneratedInThisCombo: string[] = [];

				// Generate targetCount questions
				const MAX_RATE_RETRIES = 3;
				let rateLimitRetryCount = 0;
				for (let i = 0; i < targetCount; i++) {
					try {
						// Rate limit delay
						if (questionsGenerated > 0) {
							await new Promise(resolve => setTimeout(resolve, 1000));
						}

						const alreadyGeneratedText = questionsGeneratedInThisCombo.length > 0
							? `\n\nAlready generated for this style/tone (AVOID SIMILAR THEMES OR STRUCTURES):\n- ${questionsGeneratedInThisCombo.join('\n- ')}`
							: "";

						const completion = await openai.chat.completions.create({
							model: "@preset/break-the-ice-berg-default",
							messages: [
								{
									role: "system",
									content: `You are a creative ice-breaker question generator. Generate a single unique, engaging ice-breaker question.
									
RESPOND WITH ONLY THE QUESTION TEXT. No quotes, no formatting, no explanations.

Requirements:
- Keep it short and conversational
- Make it thought-provoking but accessible
- Only ONE question mark at the end
- BE CREATIVE and explore different angles of the requested style and tone. Do not settle on a single template.`
								},
								{
									role: "user",
									content: `Generate 1 ice-breaker question.
Style: ${stylePrompt}
Tone: ${tonePrompt}${alreadyGeneratedText}`
								}
							],
							max_tokens: 100,
							temperature: 0.95,
						});

						const questionText = completion.choices[0]?.message?.content?.trim();
						if (!questionText || questionText.length < 10) {
							continue;
						}

						// Clean the question text
						const cleanedText = questionText.replace(/^["']|["']$/g, '').trim();

						// Check for exact duplicate via text index
						const existingExact = await ctx.runQuery(internal.internal.questions.checkExactDuplicate, {
							text: cleanedText,
						});
						if (existingExact) {
							console.log(`Skipping exact duplicate: ${cleanedText.substring(0, 50)}...`);
							continue;
						}

						// Check for similarity via embedding (match score > 0.9)
						const isSimilar: boolean = await ctx.runAction(internal.internal.questions.checkSimilarity, {
							text: cleanedText,
						});
						if (isSimilar) {
							console.log(`Skipping similar question: ${cleanedText.substring(0, 50)}...`);
							continue;
						}

						// Save the question with pool metadata
						const savedQuestion = await ctx.runMutation(internal.internal.questions.savePoolQuestion, {
							text: cleanedText,
							styleId: style._id,
							style: style.id,
							toneId: tone._id,
							tone: tone.id,
							poolDate: today,
						});

						if (savedQuestion) {
							questionsGenerated++;
							questionsGeneratedInThisCombo.push(cleanedText);
							rateLimitRetryCount = 0;
							// Trigger embedding generation asynchronously
							await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
								questionId: savedQuestion,
							});
						} else {
							console.warn(`Pool question save skipped (duplicate/race):`, {
								text: cleanedText.substring(0, 50) + '...',
								styleId: style.id,
								toneId: tone.id,
								poolDate: today,
							});
						}

					} catch (error: any) {
						const isRateLimit = error.status === 429;
						if (isRateLimit) {
							rateLimitRetryCount++;
							if (rateLimitRetryCount < MAX_RATE_RETRIES) {
								const retryAfter = error.headers?.['retry-after'];
								let waitTime = 5000;
								if (retryAfter) {
									const parsed = parseInt(retryAfter);
									if (Number.isFinite(parsed)) {
										waitTime = parsed * 1000;
									} else {
										const retryDate = Date.parse(retryAfter);
										if (Number.isFinite(retryDate)) {
											waitTime = Math.max(0, retryDate - Date.now());
										}
									}
								}
								console.log(`Rate limited (attempt ${rateLimitRetryCount}/${MAX_RATE_RETRIES}), waiting ${waitTime}ms...`);
								await new Promise(resolve => setTimeout(resolve, waitTime));
								i--;
							} else {
								errors.push(`Rate limit retries exhausted for ${style.name}/${tone.name} after ${MAX_RATE_RETRIES} attempts`);
								rateLimitRetryCount = 0;
							}
						} else {
							errors.push(`Error generating question for ${style.name}/${tone.name}: ${error.message}`);
						}
					}
				}

			} catch (error: any) {
				errors.push(`Error processing combo ${style.name}/${tone.name}: ${error.message}`);
			}
		}

		// Send summary email if anything happened
		if (questionsGenerated > 0 || errors.length > 0) {
			const subject = `🌙 Nightly Pool Generated: ${questionsGenerated} questions`;
			const html = `
				<h2>Nightly Question Pool Summary</h2>
				<p><strong>Date:</strong> ${today}</p>
				<p><strong>Questions Generated:</strong> ${questionsGenerated}</p>
				<p><strong>Combinations Processed:</strong> ${combinationsProcessed}/${combinations.length}</p>
				${errors.length > 0 ? `<h3>Errors (${errors.length})</h3><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
			`;
			await ctx.runAction(internal.email.sendEmail, { subject, html });
		}

		return { questionsGenerated, combinationsProcessed, errors };
	},
});
