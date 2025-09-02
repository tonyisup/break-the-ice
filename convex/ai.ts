"use node";

import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";
import { PREDEFINED_TAGS } from "./tags";

const openai = new OpenAI();

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
    currentQuestion: v.optional(v.string()),
    style: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.object({
    text: v.string(),
    tags: v.array(v.string()),
    promptUsed: v.string(),
    category: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { selectedTags, currentQuestion, style, category } = args;

    // Build the prompt based on selected tags
    let prompt = "Generate a fun, engaging ice-breaker question that would be perfect for starting conversations in a group setting. ";
    if (style) {
      prompt += `The question should be in the style of a "${style}" question. `;
    }
    if (category) {
      prompt += `The question should fit into the category: ${category}. `;
    }
    if (currentQuestion) {
      prompt += `The question should be different from the following: ${currentQuestion}. `;
    }
    if (selectedTags.length > 0) {
      const tagDescriptions = selectedTags.map(tag => {
        const tagInfo = PREDEFINED_TAGS.find(t => t.name === tag);
        return tagInfo ? `${tag} (${tagInfo.description})` : tag;
      });
      
      prompt += `The question should relate to these topics: ${tagDescriptions.join(", ")}. `;
    }
    
    prompt += "The question should be: 1) Light-hearted and fun, 2) Easy to answer for most people, 3) Open-ended enough to spark interesting conversations, 4) Appropriate for a diverse group. Keep the question concise (under 100 words).";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates engaging ice-breaker questions for group conversations. Always respond with just the question text, nothing else."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.8,
      });

      const generatedQuestion = completion.choices[0]?.message?.content?.trim();
      
      if (!generatedQuestion) {
        throw new Error("Failed to generate question");
      }

      return {
        text: generatedQuestion,
        tags: selectedTags,
        promptUsed: prompt,
        category,
      };
    } catch (error) {
      console.error("Error generating AI question:", error);
      throw new Error("Failed to generate AI question");
    }
  },
});

