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

    const existingQuestions = await ctx.runQuery(api.questions.getNextQuestions, {
      count: 5,
      style: styleId,
      tone: toneId,
    });

    // Build the prompt data structure once
    const promptData: {
      style:string;
      structure: string;
      styleGuidance?: string;
      tone: string;
      toneGuidance?: string;
      currentQuestion?: string;
      tags?: string;
      existingQuestions?: string[];
      count: number;
    } = {
      style: "",
      structure: "",
      tone: "",
      existingQuestions: existingQuestions.map((q) => q.text),
      count: generationCount,
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

    try {
      const completion = await openai.chat.completions.create({
        model: model ?? "@preset/break-the-ice-berg-default",
        messages: [
          {
            role: "system",
            content: `You are an ice-breaker generator that creates engaging ice-breaker questions for conversations. Avoid generating questions that are too similar to the existing questions provided. Always respond with a JSON array of strings, where each string is a unique question. For example: ["question 1", "question 2"]`
          },
          {
            role: "user",
            content: JSON.stringify(promptData)
          }
        ],
        max_tokens: 150 * generationCount,
        temperature: 0.8,
      });

      const generatedContent = completion.choices[0]?.message?.content?.trim();

      if (!generatedContent) {
        throw new Error("Failed to generate question");
      }

      try {
        const generatedQuestions = JSON.parse(generatedContent);
        if (Array.isArray(generatedQuestions)) {
          for (const questionText of generatedQuestions) {
            if (typeof questionText === 'string') {
              const cleanedQuestion = questionText.replace(/^["']|["']$/g, '');
              const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
                text: cleanedQuestion,
                style: styleId,
                tone: toneId,
                tags: selectedTags,
              });
              newQuestions.push(newQuestion);
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse AI response as JSON:", e);
        // Fallback for when the AI doesn't return a valid JSON array
        const cleanedQuestion = generatedContent.replace(/^["']|["']$/g, '');
        const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
            text: cleanedQuestion,
            style: styleId,
            tone: toneId,
            tags: selectedTags,
        });
        newQuestions.push(newQuestion);
      }
    } catch (error) {
      console.error("Error generating AI question:", error);
    }
    return newQuestions;
  },
});

