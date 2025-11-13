"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

const AI_API_KEY = process.env.OPENAI_API_KEY;
if (!AI_API_KEY) {
  throw new Error("AI_API_KEY environment variable not set!");
}

export async function embed(text: string | undefined): Promise<number[]> {
  if (!text) {
    return [];
  }
  const req = {
    model: "text-embedding-ada-002",
    input: text,
  };

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(req),
  });

  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`OpenAI API error: ${msg}`);
  }
  const json = await resp.json();
  const vector = json["data"][0]["embedding"];
  console.log(`Embedded text "${text}"`);
  return vector;
}

export const embedQuestion = internalAction({
  args: {
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const question = await ctx.runQuery(api.questions.getQuestion, {
      id: args.questionId,
    });
    if (!question) {
      return;
    }
    const vector = await embed(question.text);
    await ctx.runMutation(internal.questions.addEmbedding, {
      questionId: args.questionId,
      embedding: vector,
    });
  },
});
