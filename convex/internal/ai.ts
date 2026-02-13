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
				usersWithLowUnseenCount.map((userId: Id<"users">) =>
					ctx.runQuery(internal.internal.users.getUserVisibleStyles, { userId })
				)
			);
			const allUserTones = await Promise.all(
				usersWithLowUnseenCount.map((userId: Id<"users">) =>
					ctx.runQuery(internal.internal.users.getUserVisibleTones, { userId })
				)
			);

			// Flatten and de-duplicate by ID to ensure we generate variety across all targeted users
			styles = Array.from(new Map((allUserStyles.flat() as Doc<"styles">[]).map((s: Doc<"styles">) => [s._id, s])).values());
			tones = Array.from(new Map((allUserTones.flat() as Doc<"tones">[]).map((t: Doc<"tones">) => [t._id, t])).values());
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
// Remix a single question and allow changing style and tone
export const remixQuestionFull = internalAction({
	args: {
		questionText: v.string(),
		styleId: v.optional(v.id("styles")),
		toneId: v.optional(v.id("tones")),
		topicId: v.optional(v.id("topics")),
	},
	returns: v.string(),
	handler: async(ctx, args): Promise<string> => {	
		const { questionText, styleId, toneId, topicId } = args;
		
		const [style, tone, topic] = await Promise.all([
			styleId ? ctx.runQuery(internal.internal.styles.getStyleById, { id: styleId }) : null,
			toneId ? ctx.runQuery(internal.internal.tones.getToneById, { id: toneId }) : null,
			topicId ? ctx.runQuery(internal.internal.topics.getTopicById, { id: topicId }) : null,
		]);
		
		const completion = await openai.chat.completions.create({
			model: "@preset/break-the-ice-berg-default",
			messages: [
				{
					role: "system",
					content: `You are a world-class creative writer specializing in social psychology and ice-breakers.
					
					TASK: "Remix" the user's question. Change the words and phrasing completely.
					FORMAT: Return ONLY the new question text as a plain string. No quotes, no JSON, no prefixes.
					
					STYLE STRUCTURE: Use this as your base: "${style?.structure ?? "Direct and engaging"}"
					TONE GUIDE: Use this as your base: "${tone?.promptGuidanceForAI ?? "KEEP the tone of the original text"}"
					TOPIC FOCUS: Use this as your base: "${topic?.promptGuidanceForAI ?? "KEEP the topic of the original text"}"
					`
				},
				{
					role: "user",
					content: `Remix this question: "${questionText}"
					
					Context:
					Style: ${style?.name ?? "General"} (${style?.description ?? ""})
					Tone: ${tone?.name ?? "General"} (${tone?.description ?? ""})${topic ? `\n\t\t\t\t\tTopic Focus: ${topic.name} (${topic.description ?? ""})` : ""}`
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
	}
});

// Remix a single question - alters the words while keeping the same style, tone, and vibe
export const remixQuestion = internalAction({
	args: {
		questionId: v.id("questions"),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		const question = await ctx.runQuery(internal.internal.questions.getQuestionById, { id: args.questionId });
		const questionText = question?.text || question?.customText;
		if (!question || !questionText) {
			throw new Error("Question not found or has no text");
		}

		const remixedText = await ctx.runAction(internal.internal.ai.remixQuestionFull, {
			questionText,
			styleId: question.styleId,
			toneId: question.toneId,
			topicId: question.topicId,
		});

		if (!remixedText) {
			throw new Error("AI failed to generate a remix");
		}

		return remixedText.replace(/^["']|["']$/g, '').trim();
	},
});


export const generateAIQuestionForUser = internalAction({
	args: {
		userId: v.id("users"),
		count: v.optional(v.number()),
		bypassAIUsage: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
		const user = await ctx.runQuery(internal.internal.users.getUserById, { id: args.userId });

		if (!user) {
			throw new Error("You must be logged in or provide a valid user ID to generate AI questions.");
		}
		const count = args.count || 1;

		const style = (await ctx.runQuery(api.core.styles.getRandomStyleForUser, { userId: user._id }));
		const tone = (await ctx.runQuery(api.core.tones.getRandomToneForUser, { userId: user._id }));

		if (!style || !tone) {
			throw new Error("Failed to generate AI question: No style or tone found for user");
		}

		let prompt = `Style: ${style.name} (${style.description || ""}). Structure: ${style.structure}. ${style.promptGuidanceForAI || ""}`;
		prompt += `\nTone: ${tone.name} (${tone.description || ""}). ${tone.promptGuidanceForAI || ""}`;

		const recentlySeenQuestions = await ctx.runQuery(internal.internal.users.getRecentlySeenQuestions, { userId: user._id });
		const recentlySeen = recentlySeenQuestions.filter((q: string) => q !== undefined);
		if (recentlySeen.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these recently seen questions:\n- ${recentlySeen.join('\n- ')}`;
		}

		const blockedQuestions = await ctx.runQuery(internal.internal.users.getBlockedQuestions, { userId: user._id });
		if (blockedQuestions.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these blocked questions:\n- ${blockedQuestions.join('\n- ')}`;
		}

		// Retry logic for AI generation
		let attempts = 0;
		const maxAttempts = 3;
		let generatedContent = "";

		let userContext = "";

		let usageIncremented = false;
		try {
			if (!args.bypassAIUsage) {
				await ctx.runMutation(internal.internal.users.checkAndIncrementAIUsage, {
					userId: user._id,
				});
				usageIncremented = true;
			}
						

			if (user?.questionPreferenceEmbedding) {
				const nearestQuestions = await ctx.runAction(api.core.questions.getNearestQuestionsByEmbedding, {
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
    
    Example format: [{"text": "Question 1"}]
    
    Requirements:
    - Return exactly 1 question
    - Each question should be an object in the JSON array
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
    [
      {
        "text": "Would you rather have a pet dragon that only eats ice cream or a pet unicorn that only eats tacos?"
      }
    ]`
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
						generatedContent = "";
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
			const parsed = JSON.parse(cleanedContent);
			parsedContent = Array.isArray(parsed) ? parsed : [parsed];
		} catch (error) {
			console.log("Failed to parse JSON, attempting fallback parsing for numbered list...");
			// Fallback parsing for numbered lists (e.g., "1. Question\n2. Question")
			const lines = cleanedContent.split('\n');
			const regex = /^\d+\.\s*(.+)/;

			for (const line of lines) {
				const match = line.match(regex);
				if (match && match[1]) {
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

				const newQuestion = await ctx.runMutation(api.core.questions.saveAIQuestion, {
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
		} catch (error) {
			if (usageIncremented) {
				await ctx.runMutation(internal.internal.users.decrementAIUsage, { userId: user._id });
			}
			throw error;
		}
	}
});