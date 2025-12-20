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
    const randomStyle: Doc<"styles"> = await ctx.runQuery(api.styles.getRandomStyle, {});
    const randomTone: Doc<"tones"> = await ctx.runQuery(api.tones.getRandomTone, {});

    const stylePrompt = randomStyle.name + " " + randomStyle.description + " " + randomStyle.promptGuidanceForAI;
    const tonePrompt = randomTone.name + " " + randomTone.description + " " + randomTone.promptGuidanceForAI;
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
            tone: randomTone.id,
            tags: [],
          });
          return fallbackQuestion;
        } catch (error) {
          console.error("Failed to save fallback question:", error);
        }
      }
    }
    return null;
  },
});

export const generateAIQuestions = action({
  args: {
    prompt: v.optional(v.string()),
    count: v.number(),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    selectedTags: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    currentQuestion: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
    let { prompt, count, style, tone } = args;

    if (!prompt && style && tone) {
      const styleDoc = await ctx.runQuery(api.styles.getStyle, { id: style })
        || {
        name: "Would You Rather",
        description: "Forces a binary choice, sparks instant debate and reveals priorities.",
        promptGuidanceForAI: "Present two equally tempting or equally awful options to create playful tension.",
      };
      const toneDoc = await ctx.runQuery(api.tones.getTone, { id: tone })
        || {
        name: "Fun & Silly",
        description: "Light-hearted, whimsical, and designed to spark laughter without deep introspection.",
        promptGuidanceForAI: "Use playful language, absurd scenarios, and pop-culture references; keep stakes ultra-low.",
      };

      prompt = `Generate questions with the following characteristics:
Style: ${styleDoc.name} (${styleDoc.description}). ${styleDoc.promptGuidanceForAI || ""}
Tone: ${toneDoc.name} (${toneDoc.description}). ${toneDoc.promptGuidanceForAI || ""}`;
    }

    if (!prompt) {
      throw new Error("Prompt or Style/Tone must be provided");
    }

    // Retry logic for AI generation
    let attempts = 0;
    const maxAttempts = 3;
    let generatedContent = "";

    const styles: Doc<"styles">[] = await ctx.runQuery(api.styles.getStyles, {});
    const tones: Doc<"tones">[] = await ctx.runQuery(api.tones.getTones, {});

    let userContext = "";
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) {
      throw new Error("You must be logged in to generate AI questions.");
    }

    await ctx.runMutation(internal.users.checkAndIncrementAIUsage, {
      userId: user._id,
      count: count
    });
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
    
    Example format: [{"text": "Question 1", "style": "s1", "tone": "t1"}, {"text": "Question 2", "style": "s2", "tone": "t2"}]
    
    Requirements:
    - Return exactly ${count} question(s)
    - Each question should be a string in the JSON array
    - Avoid questions too similar to existing ones
    - Make questions engaging and conversation-starting
    - Only ONE question per text. There should only be one question mark at the end of the text.`
            },
            {
              role: "user",
              content: `Generate ${count} ice-breaker question(s) with these parameters:
    ${prompt}
    
    ${userContext}
    
    Response with a JSON array of objects, each containing the following properties:
    - text: The question text
    - style: The style of the question from one of the following; ${styles.map(s => s.id).join(", ")}
    - tone: The tone of the question from one of the following; ${tones.map(t => t.id).join(", ")}
    - Note that style and tone MUST be one of the identifiers provided exactly as-is.
    For example:
    [
      {
        "text": "Would you rather have a pet dragon that only eats ice cream or a pet unicorn that only eats tacos?",
        "style": "would-you-rather",
        "tone": "fun-silly"
      },
      {
        "text": "You're stranded on a desert island; you can only have one luxury item. What would it be and why?",
        "style": "desert-island",
        "tone": "deep-thoughtful"
      }
    ]`
            }
          ],
          max_tokens: 500 * count,
          temperature: 0.7,
        });

        generatedContent = completion.choices[0]?.message?.content?.trim() || "";

        if (!generatedContent) {
          console.log(`Attempt ${attempts}: No content generated`);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            continue;
          }
          throw new Error("Failed to generate question after multiple attempts");
        }

        // Validate that we have a reasonable response length
        if (generatedContent.length < 10) {
          console.log(`Attempt ${attempts}: Response too short (${generatedContent.length} chars):`, generatedContent);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error("AI response too short");
        }

        // If we get here, we have content, so break out of the retry loop
        break;

      } catch (error) {
        console.error(`Attempt ${attempts} failed:`, error);
        if (attempts >= maxAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
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

    let parsedContent: { text: string; style: string; tone: string }[] = [];

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
          // We don't have style/tone in this format, so we use the requested ones or empty strings
          parsedContent.push({
            text: match[1].trim(),
            style: style || styles[0]?.id || "would-you-rather",
            tone: tone || tones[0]?.id || "fun-silly"
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

    const newQuestions: (Doc<"questions"> | null)[] = [];
    for (const question of parsedContent) {
      try {
        if (!styles.find(s => s.id === question.style)) {
          console.log(`Invalid style ${question.style} for question ${question.text}`);
          continue;
        }
        if (!tones.find(t => t.id === question.tone)) {
          console.log(`Invalid tone ${question.tone} for question ${question.text}`);
          continue;
        }
        const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
          text: question.text,
          style: question.style,
          tone: question.tone,
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
    const { subject, html } = createPopulateMissingEmbeddingsEmail(results);
    await ctx.runAction(internal.email.sendEmail, { subject, html });
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
    const { subject, html } = createPopulateMissingStyleEmbeddingsEmail(results);
    await ctx.runAction(internal.email.sendEmail, { subject, html });
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
    const { subject, html } = createPopulateMissingToneEmbeddingsEmail(results);
    await ctx.runAction(internal.email.sendEmail, { subject, html });
  },
});

export const detectDuplicateQuestionsStreaming = action({
  args: {},
  returns: v.id("duplicateDetectionProgress"),
  handler: async (ctx: any) => {
    // 1. Initialize progress
    const totalQuestions = await ctx.runQuery(internal.questions.countQuestions);
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(totalQuestions / BATCH_SIZE);

    const progressId = await ctx.runMutation(api.duplicates.createDuplicateDetectionProgress, {
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
        const result: { questions: { _id: Id<"questions">, text: string, embedding: number[] }[], continueCursor: string, isDone: boolean } =
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
