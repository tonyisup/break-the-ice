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
          content: "Generate a single engaging ice-breaker question. Respond with ONLY the question text, no quotes or formatting."
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
    prompt: v.string(),
    count: v.number()
  },
  handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
    const { prompt, count } = args;

    // Retry logic for AI generation
    let attempts = 0;
    const maxAttempts = 3;
    let generatedContent = "";

    const styles: Doc<"styles">[] = await ctx.runQuery(api.styles.getStyles, {});
    const tones: Doc<"tones">[] = await ctx.runQuery(api.tones.getTones, {});

    let userContext = "";
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
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
              content: `You are an ice-breaker generator that creates engaging ice-breaker questions for conversations. 

CRITICAL: You must ALWAYS respond with ONLY a valid JSON array of objects. Do not include any text before or after the JSON. Do not use markdown formatting. Do not include explanations or comments.

Example format: ["What's your favorite childhood memory?", "If you could have dinner with anyone, who would it be?"]

Requirements:
- Return exactly ${count} question(s)
- Each question should be a string in the JSON array
- Avoid questions too similar to existing ones
- Make questions engaging and conversation-starting`
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
    try {
      const parsedContent: { text: string; style: string; tone: string }[] = JSON.parse(generatedContent);
      const newQuestions: (Doc<"questions"> | null)[] = [];
      for (const question of parsedContent) {
        try {
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
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      throw error;
    }
  }
})

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
