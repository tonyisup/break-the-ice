"use node";

import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import OpenAI from "openai";

const openai = new OpenAI();

// Predefined tags for different categories
const PREDEFINED_TAGS = [
  { name: "fitness", category: "health", description: "Questions about fitness and exercise" },
  { name: "work", category: "professional", description: "Questions about work and career" },
  { name: "travel", category: "lifestyle", description: "Questions about travel and adventures" },
  { name: "food", category: "lifestyle", description: "Questions about food and cooking" },
  { name: "music", category: "entertainment", description: "Questions about music and entertainment" },
  { name: "movies", category: "entertainment", description: "Questions about movies and TV shows" },
  { name: "books", category: "entertainment", description: "Questions about books and reading" },
  { name: "technology", category: "professional", description: "Questions about technology and gadgets" },
  { name: "family", category: "personal", description: "Questions about family and relationships" },
  { name: "hobbies", category: "personal", description: "Questions about hobbies and interests" },
  { name: "dreams", category: "personal", description: "Questions about dreams and aspirations" },
  { name: "childhood", category: "personal", description: "Questions about childhood memories" },
  { name: "learning", category: "personal", description: "Questions about learning and education" },
  { name: "adventure", category: "lifestyle", description: "Questions about adventure and exploration" },
  { name: "creativity", category: "personal", description: "Questions about creativity and art" },
];

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
  },
  returns: v.object({
    text: v.string(),
    tags: v.array(v.string()),
    promptUsed: v.string(),
  }),
  handler: async (ctx, args) => {
    const { selectedTags } = args;

    // Build the prompt based on selected tags
    let prompt = "Generate a fun, engaging ice-breaker question that would be perfect for starting conversations in a group setting. ";
    
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
      };
    } catch (error) {
      console.error("Error generating AI question:", error);
      throw new Error("Failed to generate AI question");
    }
  },
});

