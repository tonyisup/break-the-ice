"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { ensureAdmin } from "../auth";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import OpenAI from "openai";
const openai = new OpenAI({
	baseURL: 'https://openrouter.ai/api/v1',
	apiKey: process.env.OPEN_ROUTER_API_KEY,
	timeout: 30000, // 30 second timeout
	defaultHeaders: {
		'HTTP-Referer': 'https://breaktheiceberg.com',
		'X-Title': 'Break the ice(berg)',
	},
});
export const startDuplicateDetection = 	action({
	args: {
		threshold: v.optional(v.number()),
	},
	returns: v.id("duplicateDetectionProgress"),
	handler: async (ctx, args): Promise<Id<"duplicateDetectionProgress">> => {
		await ensureAdmin(ctx);
		return await ctx.runAction(internal.internal.ai.detectDuplicateQuestionsStreaming, {
			threshold: args.threshold,
		}) as Id<"duplicateDetectionProgress">;
	},
});


export const generateAIQuestions = action({
	args: {
		count: v.number(),
		selectedTags: v.array(v.string()),
		currentQuestion: v.optional(v.string()),
		excludedQuestions: v.optional(v.array(v.string())),
		styleId: v.optional(v.id("styles")),
		style: v.optional(v.string()),
		toneId: v.optional(v.id("tones")),
		tone: v.optional(v.string()),
		topicId: v.optional(v.id("topics")),
		topic: v.optional(v.string()),
	},
	handler: async (ctx, args) => {		
		await ensureAdmin(ctx);
		const { count, selectedTags, currentQuestion, excludedQuestions, styleId, toneId, topicId } = args;

		const user = await ctx.runQuery(api.core.users.getCurrentUser, {});

		if (!user) {
			throw new Error("You must be logged in to generate AI questions.");
		}


		const style = styleId 
			? (await ctx.runQuery(api.core.styles.getStyleById, { id: styleId }))
			: args.style ? (await ctx.runQuery(api.core.styles.getStyle, { id: args.style })) : null;
			
		const tone = toneId
			? (await ctx.runQuery(api.core.tones.getToneById, { id: toneId }))
			: args.tone ? (await ctx.runQuery(api.core.tones.getTone, { id: args.tone })) : null;
			
		const topic = topicId 
			? (await ctx.runQuery(api.core.topics.getTopicById, { id: topicId }))
			: args.topic ? (await ctx.runQuery(api.core.topics.getTopic, { id: args.topic })) : null;

		if (!style || !tone) {
			throw new Error("Failed to generate AI question: No style or tone found.");
		}

		let prompt = `Style: ${style.name} (${style.description || ""}). Structure: ${style.structure}. ${style.promptGuidanceForAI || ""}`;
		prompt += `\nTone: ${tone.name} (${tone.description || ""}). ${tone.promptGuidanceForAI || ""}`;

		if (topic) {
			prompt += `\nTopic Focus: ${topic.name} (${topic.description || ""})`;
			if (topic.promptGuidanceForAI) {
				prompt += `\nAI Guidance for Topic: ${topic.promptGuidanceForAI}`;
			}
		}

		if (selectedTags.length > 0) {
			prompt += `\nTags: ${selectedTags.join(", ")}`;
		}

		const excluded = [...(excludedQuestions ?? [])];
		if (currentQuestion) excluded.push(currentQuestion);

		if (excluded.length > 0) {
			prompt += `\n\nCRITICAL: Avoid topics, patterns, or phrasing similar to these recently seen questions:\n- ${excluded.join('\n- ')}`;
		}

		// Retry logic for AI generation
		let attempts = 0;
		const maxAttempts = 3;
		let generatedContent = "";

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

		for (const question of parsedContent) {
			try {
				// Simple dedupe check
				return question.text;

			} catch (error) {
				console.error(`Failed to save question: "${question.text}"`, error);
				// Continue with other questions even if one fails
			}
		}
		throw new Error("No questions generated");
	}
});