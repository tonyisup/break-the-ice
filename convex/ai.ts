"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";

const openai = new OpenAI();

const categoryPromptMap: Record<string, string> = {
  fun: "The question should be light-hearted and funny. Ideal for parties and social gatherings.",
  deep: "The question should be personal and thought-provoking. Ideal for introspection and self-discovery.",
  professional: "The question should be about work and career. Safe for work. Ideal for work events and networking.",
  wouldYouRather: "The question should be in the style of would-you-rather questions. It must be in the format of 'would you rather ____ or ____'. It may also be in the format of 'If you could _____, would you rather ____ or ____'.",
  thisOrThat: "The question should be short and concise and in the style of this-or-that questions. It must be in the format of '____ or ____'.",
  crossfit: "The question should be in the style of question-of-the-day questions for CrossFit. Ideal for CrossFit enthusiasts.",
  random: "The question can be in any style in (fun, deep, professional, wouldYouRather, thisOrThat, crossfit).",
}

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
    currentQuestion: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.object({
    text: v.string(),
    tags: v.array(v.string()),
    promptUsed: v.string(),
    category: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { selectedTags, currentQuestion, category } = args;

    let prompt = "Generate an ice-breaker question that would be perfect for starting conversations in a group setting. ";

    if (category) {
      prompt += categoryPromptMap[category];
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
        model: "gpt-4o-mini",
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
        promptUsed: prompt,
        category,
      };
    } catch (error) {
      console.error("Error generating AI question:", error);
      throw new Error("Failed to generate AI question");
    }
  },
});

