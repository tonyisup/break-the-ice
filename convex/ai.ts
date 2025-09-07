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

const FULL_SYSTEM_PROMPT = `You are an ice-breaker generator that combines a STYLE (question structure) with a TONE (vibe/color) to create a unique, conversation-starting prompt.
Rules
1. You will receive two inputs:
   - style: a JSON object with fields {id, name, structure, example, promptGuidanceForAI, ...}
   - tone: a JSON object with fields {id, name, promptGuidanceForAI, color, icon}

2. Fuse the STRUCTURE from the style with the VIBE from the tone.
   - Keep the skeleton of the style’s “structure” field.
   - Inject the tone’s “promptGuidanceForAI” vibe (word choice, references, energy level).
   - Never repeat the raw JSON; output only the finished ice-breaker question.

3. Output a single, ready-to-use question. No extra chatter, no bullet lists, no explanations.

4. If the tone is “Professional,” keep it HR-safe; if it’s “Edgy,” push gently without offending. Always match the spirit of the tone.

5. Feel free to tweak pop-culture references or timeframes so they feel fresh and natural.

Example fusion
style: Would You Rather — “Would you rather A or B?”
tone: Nerdy & Geeky
output: “Would you rather debug legacy Python 2.7 code forever or attend endless meetings with no agenda?`

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
    currentQuestion: v.optional(v.string()),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"questions"> | null> => {
    const { selectedTags, currentQuestion, style: styleId, tone: toneId, model } = args;

    let prompt = "Generate an ice-breaker question that would be perfect for starting conversations in a group setting. ";

    if (styleId) {
      const style = await ctx.runQuery(api.styles.getStyle, { id: styleId });
      prompt += `The question should be in the STYLE of ${style.name}. `;
      prompt += `The question should be in the STRUCTURE of ${style.structure}. `;
      prompt += `Guidance for the AI: ${style.promptGuidanceForAI}. `;
    }
    if (toneId) {
      const tone = await ctx.runQuery(api.tones.getTone, { id: toneId });
      prompt += `The question should be in the TONE of ${tone.name}. `;
      prompt += `Guidance for the AI: ${tone.promptGuidanceForAI}. `;
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
            content: (styleId && toneId) ? FULL_SYSTEM_PROMPT : `You are an ice-breaker generator that creates engaging ice-breaker questions for conversations. Always respond with just the question text, nothing else.`
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

      const newQuestion: Doc<"questions"> | null = await ctx.runMutation(api.questions.saveAIQuestion, {
        text: generatedQuestion,
        style:styleId,
        tone:toneId,
        tags: selectedTags,
      });
      return newQuestion;
    } catch (error) {
      console.error("Error generating AI question:", error);
      throw new Error("Failed to generate AI question");
    }
  },
});

