"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";
import { api } from "./_generated/api";

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
    category: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.object({
    text: v.string(),
    tags: v.array(v.string()),
    category: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { selectedTags, currentQuestion, category, model } = args;

    let prompt = "Generate an ice-breaker question that would be perfect for starting conversations in a group setting. ";
    const categories = await ctx.runQuery(api.categories.getCategories);
    if (category) {
      prompt += categories.find(q => q.id === category)?.prompt ?? "";
    }
    if (currentQuestion) {
      prompt += `The question should be different from the following: ${currentQuestion}. `;
    }
    if (selectedTags.length > 0) {      
      prompt += `The question should include these topics: ${selectedTags.join(", ")}. `;
    }
    
    prompt += "Keep the question concise (under 100 words).";

    try {
      const completion = await openai.chat.completions.create({
        model: model ?? "mistralai/mistral-nemo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that creates engaging ice-breaker questions for conversations. Always respond with just the question text, nothing else."
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
        category,
      };
    } catch (error) {
      console.error("Error generating AI question:", error);
      throw new Error("Failed to generate AI question");
    }
  },
});

