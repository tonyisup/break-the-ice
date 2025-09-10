"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://breaktheiceberg.com', 
    'X-Title': 'Break the ice(berg)', 
  },
});

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
    currentQuestion: v.optional(v.string()),
    style: v.string(),
    tone: v.string(),
    model: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
    const { selectedTags, currentQuestion, style: styleId, tone: toneId, model, count } = args;
    const generationCount = count ?? 1;
    const newQuestions: (Doc<"questions"> | null)[] = [];

    // Build the prompt data structure once
    const promptData: {
      style: string;
      structure: string;
      styleGuidance?: string;
      tone: string;
      toneGuidance?: string;
      currentQuestion?: string;
      tags?: string;
    } = {
      style: "",
      structure: "",
      tone: "",
    };

    if (styleId) {
      const style = await ctx.runQuery(api.styles.getStyle, { id: styleId });
      if (style) {
        promptData.style = style.name;
        promptData.structure = style.structure;
        promptData.styleGuidance = style.promptGuidanceForAI;
      }
    }
    if (toneId) {
      const tone = await ctx.runQuery(api.tones.getTone, { id: toneId });
      if (tone) {
        promptData.tone = tone.name;
        promptData.toneGuidance = tone.promptGuidanceForAI;
      }
    }
    if (currentQuestion) {
      promptData.currentQuestion = currentQuestion;
    }
    if (selectedTags.length > 0) {
      promptData.tags = selectedTags.join(", ");
    }

    for (let i = 0; i < generationCount; i++) {
      try {
        const completion = await openai.chat.completions.create({
          model: model ?? "@preset/break-the-ice-berg-default",
          messages: [
            {
              role: "system",
              content: `You are an ice-breaker generator that creates engaging ice-breaker questions for conversations. Always respond with just the question text, nothing else.`
            },
            {
              role: "user",
              content: JSON.stringify(promptData)
            }
          ],
          max_tokens: 150,
          temperature: 0.8,
        });

        const generatedQuestion = completion.choices[0]?.message?.content?.trim();

        if (!generatedQuestion) {
          throw new Error("Failed to generate question");
        }
        // Remove any quotes from the generated question
        const cleanedQuestion = generatedQuestion.replace(/^["']|["']$/g, '');

        const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
          text: cleanedQuestion,
          style:styleId,
          tone:toneId,
          tags: selectedTags,
        });
        newQuestions.push(newQuestion);
      } catch (error) {
        console.error("Error generating AI question:", error);
        // We still want to return any questions that were successfully generated
        // before the error occurred.
        break;
      }
    }
    return newQuestions;
  },
});

