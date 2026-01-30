"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { createDuplicateDetectionEmail, createMinimumQuestionsEmail, createPopulateMissingEmbeddingsEmail, createPopulateMissingStyleEmbeddingsEmail, createPopulateMissingToneEmbeddingsEmail } from "./lib/emails";

const openai = new OpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: process.env.OPEN_ROUTER_API_KEY,
	timeout: 30000, // 30 second timeout
	defaultHeaders: {
		'HTTP-Referer': 'https://breaktheiceberg.com',
		'X-Title': 'Break the ice(berg)',
	},
});

export const preview = action({
	args: {
		count: v.optional(v.number()),
		style: v.string(),
		tone: v.string(),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args): Promise<Doc<"questions">[]> => {
		return await ctx.runQuery(api.questions.getSimilarQuestions, {
			count: args.count ?? 5,
			style: args.style,
			tone: args.tone,
		});
	},
});

export const generateFallbackQuestion = action({
	args: {},
	returns: v.union(v.any(), v.null()),
	handler: async (ctx): Promise<Doc<"questions"> | null> => {
		const randomStyle: Doc<"styles"> = await ctx.runQuery(api.styles.getRandomStyle, { seed: Math.random() });
		const randomTone: Doc<"tones"> = await ctx.runQuery(api.tones.getRandomTone, { seed: Math.random() });

		const stylePrompt = randomStyle.name + " " + randomStyle.description + " " + randomStyle.promptGuidanceForAI;
		const tonePrompt = randomTone.name + " " + randomTone.description + " " + randomTone.promptGuidanceForAI;

		let attempts = 0;
		const maxAttempts = 3;

		while (attempts < maxAttempts) {
			try {
				attempts++;
				const fallbackCompletion = await openai.chat.completions.create({
					model: "@preset/break-the-ice-berg-default",
					messages: [
						{
							role: "system",
							content: "Generate a single engaging ice-breaker question. Respond with ONLY the ONE question text, no quotes or formatting."
						},
						{
							role: "user",
							content: `Generate 1 ice-breaker question for style: ${stylePrompt}, tone: ${tonePrompt}`
						}
					],
					max_tokens: 100,
					temperature: 0.7,
				});

				const fallbackContent = fallbackCompletion.choices[0]?.message?.content?.trim();
				if (fallbackContent) {
					const cleanedFallback = fallbackContent.replace(/^["']|["']$/g, '').trim();
					if (cleanedFallback.length > 0) {
						try {
							const fallbackQuestion: Doc<"questions"> | null = await ctx.runMutation(api.questions.saveAIQuestion, {
								text: cleanedFallback,
								style: randomStyle.id,
								styleId: randomStyle._id,
								tone: randomTone.id,
								toneId: randomTone._id,
								tags: [],
							});
							return fallbackQuestion;
						} catch (error) {
							console.error("Failed to save fallback question:", error);
						}
					}
				}
				break; // Success or unrecoverable empty response
			} catch (error: any) {
				const isRateLimit = error.status === 429 || error.message?.includes("429");
				console.error(`Fallback Attempt ${attempts} failed (${isRateLimit ? "Rate Limit" : "Error"}):`, error);

				if (attempts >= maxAttempts) {
					break;
				}

				let waitTime = 1000 * Math.pow(2, attempts - 1);
				if (error.status === 429) {
					const retryAfter = error.headers?.['retry-after'];
					if (retryAfter) {
						const seconds = parseInt(retryAfter);
						waitTime = !isNaN(seconds) ? seconds * 1000 : 1000;
					}
				}
				await new Promise(resolve => setTimeout(resolve, waitTime));
			}
		}
		return null;
	},
});

export const generateAIQuestionForFeed = action({
	args: {
		userId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
		const user = await ctx.runQuery(api.users.getCurrentUser, {});

		if (!user) {
			throw new Error("You must be logged in or provide a valid user ID to generate AI questions.");
		}
		const count = 1;

		const style = (await ctx.runQuery(api.styles.getRandomStyleForUser, { userId: user._id }));
		const tone = (await ctx.runQuery(api.tones.getRandomToneForUser, { userId: user._id }));

		if (!style || !tone) {
			throw new Error("Failed to generate AI question: No style or tone found for user");
		}

		let prompt = '';

		const recentlySeenQuestions = await ctx.runQuery(internal.users.getRecentlySeenQuestions, { userId: user._id });
		const recentlySeen = recentlySeenQuestions.filter((q) => q !== undefined);
		if (recentlySeen.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these recently seen questions:\n- ${recentlySeen.join('\n- ')}`;
		}

		const blockedQuestions = await ctx.runQuery(internal.users.getBlockedQuestions, { userId: user._id });
		if (blockedQuestions.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these blocked questions:\n- ${blockedQuestions.join('\n- ')}`;
		}

		if (!prompt) {
			throw new Error("Prompt or Style/Tone must be provided");
		}

		// Retry logic for AI generation
		let attempts = 0;
		const maxAttempts = 3;
		let generatedContent = "";

		let userContext = "";

		const allowedCount = await ctx.runMutation(internal.users.checkAndIncrementAIUsage, {
			userId: user._id,
		});
		if (allowedCount < 0) {
			throw new Error("You have reached your AI question limit. Please upgrade your plan.");
		}
		if (user?.questionPreferenceEmbedding) {
			const nearestQuestions = await ctx.runAction(api.questions.getNearestQuestionsByEmbedding, {
				embedding: user.questionPreferenceEmbedding,
				count: 5
			});
			const examples = nearestQuestions.map((q: any) => q.text).filter((t: any): t is string => !!t);
			// Fallback if vector search returns empty (e.g. strict filter with no results)
			if (examples.length > 0) {
				userContext = "User likes questions similar to: " + examples.join("; ");
			}
		}

		while (attempts < maxAttempts && !generatedContent) {
			try {
				attempts++;
				const completion = await openai.chat.completions.create({
					model: "@preset/break-the-ice-berg-default",
					messages: [
						{
							role: "system",
							content: `You are clever, well travelled, emotionally and socially intelligent. You will provide guidance and suggestions to help people break the ice in social settings. You will be providing unique questions that would be perfect for starting conversations. You will be able to combine a provided STYLE (question structure) with a TONE (vibe/color).
    
    CRITICAL: You must ALWAYS respond with ONLY a valid JSON array of objects.
    - Do not include any text before or after the JSON.
    - Do not use markdown formatting (no \`\`\`json wrappers).
    - Do not include explanations or comments.
    - Do not number the items in the array (e.g. no "1. {...}").
		- DO NOT provide your own examples of any generated content. No dashes, no lists.
    
    Example format: {"text": "Question 1"}
    
    Requirements:
    - Return exactly 1 question
    - Each question should be a string in the JSON array
    - Avoid questions too similar to existing ones
    - Make questions engaging and conversation-starting
		- Avoid being verbose; keep it short and sweet.
    - Only ONE question per text. There should only be one question mark at the end of the text.`
						},
						{
							role: "user",
							content: `Generate 1 ice-breaker question with these parameters:
    ${prompt}
    
    ${userContext}
    
    Response with a JSON array of objects, each containing the following properties:
    - text: The question text
    For example:
    {
      {
        "text": "Would you rather have a pet dragon that only eats ice cream or a pet unicorn that only eats tacos?"
      }
    }`
						}
					],
					max_tokens: 200,
					temperature: 0.7,
				});

				generatedContent = completion.choices[0]?.message?.content?.trim() || "";

				if (!generatedContent) {
					console.log(`Attempt ${attempts}: No content generated`);
					if (attempts < maxAttempts) {
						const waitTime = 1000 * Math.pow(2, attempts - 1);
						console.log(`No content generated. Waiting ${waitTime}ms before retry ${attempts + 1}/${maxAttempts}...`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
						continue;
					}
					throw new Error("Failed to generate question after multiple attempts");
				}

				// Validate that we have a reasonable response length
				if (generatedContent.length < 10) {
					console.log(`Attempt ${attempts}: Response too short (${generatedContent.length} chars):`, generatedContent);
					if (attempts < maxAttempts) {
						const waitTime = 1000 * Math.pow(2, attempts - 1);
						console.log(`Response too short. Waiting ${waitTime}ms before retry ${attempts + 1}/${maxAttempts}...`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
						continue;
					}
					throw new Error("AI response too short");
				}

				// If we get here, we have content, so break out of the retry loop
				break;

			} catch (error: any) {
				const isRateLimit = error.status === 429 || error.message?.includes("429");
				console.error(`Attempt ${attempts} failed (${isRateLimit ? "Rate Limit" : "Error"}):`, error);

				if (attempts >= maxAttempts) {
					throw error;
				}

				let waitTime = 1000 * Math.pow(2, attempts - 1); // Exponential backoff by default
				if (error.status === 429) {
					const retryAfter = error.headers?.['retry-after'];
					if (retryAfter) {
						const seconds = parseInt(retryAfter);
						if (!isNaN(seconds)) {
							waitTime = seconds * 1000;
						} else {
							// Could be a date string
							const retryDate = new Date(retryAfter).getTime();
							if (!isNaN(retryDate)) {
								waitTime = Math.max(1000, retryDate - Date.now());
							}
						}
					}
					console.log(`Respecting 429 Rate Limit. Waiting ${waitTime}ms before retry ${attempts + 1}/${maxAttempts}...`);
				}

				await new Promise(resolve => setTimeout(resolve, waitTime));
			}
		}

		if (!generatedContent) {
			throw new Error("Failed to generate question after all attempts");
		}

		// Try to clean and parse the response
		// Remove markdown code blocks if present
		const cleanedContent = generatedContent
			.replace(/^```json\s*/, "")
			.replace(/^```\s*/, "")
			.replace(/\s*```$/, "");

		let parsedContent: { text: string; }[] = [];

		try {
			parsedContent = JSON.parse(cleanedContent);
		} catch (error) {
			console.log("Failed to parse JSON, attempting fallback parsing for numbered list...");
			// Fallback parsing for numbered lists (e.g., "1. Question\n2. Question")
			const lines = cleanedContent.split('\n');
			const regex = /^\d+\.\s*(.+)/;

			for (const line of lines) {
				const match = line.match(regex);
				if (match) {
					parsedContent.push({
						text: match[1].trim(),
					});
				}
			}

			if (parsedContent.length === 0) {
				console.error("Failed to parse AI response. Content was:", generatedContent);
				console.error("Cleaned content was:", cleanedContent);
				console.error("Parse error:", error);
				throw error;
			}
		}

		const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
		const normalizedRecentlySeen = recentlySeen.map((q: string) => normalize(q));

		const newQuestions: (Doc<"questions"> | null)[] = [];
		for (const question of parsedContent) {
			try {
				// Simple dedupe check
				const normalizedText = normalize(question.text);
				const isDuplicate = normalizedRecentlySeen.some((seen: string) =>
					normalizedText.includes(seen) || seen.includes(normalizedText)
				);

				if (isDuplicate) {
					console.log(`Skipping duplicate/similar question: ${question.text}`);
					continue;
				}

				const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
					text: question.text,
					style: style.id,
					styleId: style._id,
					tone: tone.id,
					toneId: tone._id,
					tags: [],
				});
				newQuestions.push(newQuestion);
			} catch (error) {
				console.error(`Failed to save question: "${question.text}"`, error);
				// Continue with other questions even if one fails
			}
		}
		return newQuestions;
	}
});

export const populateMissingEmbeddings = internalAction({
	args: {
		maxBatchSize: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const questions = await ctx.runQuery(internal.questions.getQuestionsWithMissingEmbeddings);
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
		const styles = await ctx.runQuery(internal.styles.getStylesWithMissingEmbeddings);
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
		const tones = await ctx.runQuery(internal.tones.getTonesWithMissingEmbeddings);
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
	args: {},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx): Promise<Id<"duplicateDetectionProgress">> => {
		// 1. Initialize progress
		const totalQuestions = await ctx.runQuery(internal.questions.countQuestions);
		const BATCH_SIZE = 50;
		const totalBatches = Math.ceil(totalQuestions / BATCH_SIZE);

		const progressId: Id<"duplicateDetectionProgress"> = await ctx.runMutation(api.duplicates.createDuplicateDetectionProgress, {
			totalQuestions,
			totalBatches,
		});

		// 2. Fetch already pending/approved detections to avoid re-detecting
		// We can't easily fetch ALL detected pairs, so we'll just check against existing detections during the loop or
		// rely on the `saveDuplicateDetection` uniqueness check if any.
		// However, `saveDuplicateDetection` doesn't enforce uniqueness on question pairs, so we should try to avoid it.
		// For now, let's just proceed. The user can reject duplicates if they are already handled.

		// 3. Start processing in background (or simpler: loop here and update progress)
		// Since this is an action, it can run for a while.

		// We need to fetch questions in batches.
		let cursor: string | null = null;
		let processedQuestions = 0;
		let duplicatesFound = 0;
		let currentBatch = 0;
		const errors: string[] = [];

		// Helper to check if we should continue
		// (In a real background job we might check for cancellation)

		try {
			do {
				currentBatch++;

				// Fetch batch of questions with embeddings
				const result: { questions: { _id: Id<"questions">, text?: string, embedding?: number[] }[], continueCursor: string, isDone: boolean } =
					await ctx.runQuery(internal.questions.getQuestionsWithEmbeddingsBatch, {
						cursor,
						limit: BATCH_SIZE
					});

				const questions = result.questions;
				cursor = result.continueCursor; // Update cursor for next iteration logic
				const isDone = result.isDone;

				// Process this batch
				for (const question of questions) {
					if (!question.embedding || question.embedding.length === 0) continue;

					// Search for similar questions
					// We use vector search.
					// We are looking for VERY similar questions (duplicates).
					// Threshold: 0.95 or higher?
					const searchResults = await ctx.vectorSearch("questions", "by_embedding", {
						vector: question.embedding,
						limit: 5, // We only care about the top few matches
					});

					for (const match of searchResults) {
						// Ignore self and ensure unique pair processing (A-B vs B-A) by enforcing order
						if (match._id <= question._id) continue;

						// Check score
						if (match._score > 0.95) {
							// Potential duplicate!
							try {
								// saveDuplicateDetection will handle sorting IDs and basic checks.
								const result = await ctx.runMutation(internal.questions.saveDuplicateDetection, {
									questionIds: [question._id, match._id],
									reason: `High embedding similarity (${match._score.toFixed(4)})`,
									confidence: match._score,
								});
								if (result) {
									duplicatesFound++;
								}
							} catch (e) {
								// Ignore errors (e.g. if we add uniqueness constraint later)
								console.error("Error saving duplicate:", e);
							}
						}
					}
				}

				processedQuestions += questions.length;

				// Update progress
				await ctx.runMutation(api.duplicates.updateDuplicateDetectionProgress, {
					progressId,
					processedQuestions,
					currentBatch,
					duplicatesFound,
					errors,
				});

				if (isDone) {
					break;
				}

			} while (cursor); // Continue if cursor exists (logic handled by isDone check inside, but good to have safety)

			await ctx.runMutation(api.duplicates.completeDuplicateDetectionProgress, {
				progressId,
				processedQuestions,
				duplicatesFound,
				errors,
			});

		} catch (error) {
			console.error("Duplicate detection failed:", error);
			errors.push(error instanceof Error ? error.message : String(error));
			await ctx.runMutation(api.duplicates.failDuplicateDetectionProgress, {
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
		const today = new Date().toISOString().split('T')[0]; // "2026-01-30"

		let questionsGenerated = 0;
		let combinationsProcessed = 0;
		const errors: string[] = [];

		// Get all styles and tones
		const styles: Doc<"styles">[] = await ctx.runQuery(api.styles.getStyles, {});
		const tones: Doc<"tones">[] = await ctx.runQuery(api.tones.getTones, {});

		// Create all combinations
		const combinations: { style: Doc<"styles">, tone: Doc<"tones"> }[] = [];
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

				// Generate targetCount questions
				for (let i = 0; i < targetCount; i++) {
					try {
						// Rate limit delay
						if (questionsGenerated > 0) {
							await new Promise(resolve => setTimeout(resolve, 1000));
						}

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
- Only ONE question mark at the end`
								},
								{
									role: "user",
									content: `Generate 1 ice-breaker question.
Style: ${stylePrompt}
Tone: ${tonePrompt}`
								}
							],
							max_tokens: 100,
							temperature: 0.9, // Higher for variety
						});

						const questionText = completion.choices[0]?.message?.content?.trim();
						if (!questionText || questionText.length < 10) {
							continue;
						}

						// Clean the question text
						const cleanedText = questionText.replace(/^["']|["']$/g, '').trim();

						// Check for exact duplicate via text index
						const existingExact = await ctx.runQuery(internal.questions.checkExactDuplicate, {
							text: cleanedText,
						});
						if (existingExact) {
							console.log(`Skipping exact duplicate: ${cleanedText.substring(0, 50)}...`);
							continue;
						}

						// Save the question with pool metadata
						const savedQuestion = await ctx.runMutation(internal.questions.savePoolQuestion, {
							text: cleanedText,
							styleId: style._id,
							style: style.id,
							toneId: tone._id,
							tone: tone.id,
							poolDate: today,
						});

						if (savedQuestion) {
							questionsGenerated++;
							// Trigger embedding generation asynchronously
							await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
								questionId: savedQuestion,
							});
						}

					} catch (error: any) {
						const isRateLimit = error.status === 429;
						if (isRateLimit) {
							// Wait and retry
							const retryAfter = error.headers?.['retry-after'];
							const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
							console.log(`Rate limited, waiting ${waitTime}ms...`);
							await new Promise(resolve => setTimeout(resolve, waitTime));
							i--; // Retry this iteration
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
