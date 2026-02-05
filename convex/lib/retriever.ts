"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import OpenAI from "openai";

const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;
if (!OPEN_ROUTER_API_KEY) {
  throw new Error("OPEN_ROUTER_API_KEY environment variable not set!");
}

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPEN_ROUTER_API_KEY,
  timeout: 30000,
  defaultHeaders: {
    'HTTP-Referer': 'https://breaktheiceberg.com',
    'X-Title': 'Break the ice(berg)',
  },
});

export async function embed(text: string | undefined): Promise<number[]> {
  if (!text) {
    return [];
  }

  try {
    const response = await openai.embeddings.create({
      model: "sentence-transformers/all-minilm-l6-v2",
      input: text,
    });

    const vector = response.data[0].embedding;
    // console.log(`Embedded text "${text}"`);
    return vector;
  } catch (error) {
    console.error(`Embedding error for text "${text}":`, error);
    throw error;
  }
}

export const embedQuestion = internalAction({
  args: {
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const question = await ctx.runQuery(api.core.questions.getQuestion, {
      id: args.questionId,
    });
    if (!question) {
      return;
    }
    // Only embed if there is text
    const textToEmbed = question.text ?? question.customText;
    if (!textToEmbed) return;

    const vector = await embed(textToEmbed);
    await ctx.runMutation(internal.internal.questions.addEmbedding, {
      questionId: args.questionId,
      embedding: vector,
    });
  },
});

export const embedTopic = internalAction({
  args: {
    topicId: v.id("topics"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const topic = await ctx.runQuery(api.core.topics.getTopicById, {
      id: args.topicId,
    });
    if (!topic) {
      return null;
    }

    // Construct text to embed: name + description + promptGuidanceForAI
    const textParts = [topic.name];
    if (topic.description) textParts.push(topic.description);
    if (topic.promptGuidanceForAI) textParts.push(topic.promptGuidanceForAI);

    const textToEmbed = textParts.join(". ");

    const vector = await embed(textToEmbed);
    await ctx.runMutation(internal.internal.topics.addTopicEmbedding, {
      topicId: args.topicId,
      embedding: vector,
    });
    return null;
  },
});
export const embedStyle = internalAction({
  args: {
    styleId: v.id("styles"),
  },
  handler: async (ctx, args) => {
    const style = await ctx.runQuery(internal.internal.styles.getStyleBySystemId, {
      id: args.styleId,
    });
    if (!style) {
      return;
    }

    // Construct text to embed: name + description + promptGuidanceForAI
    const textParts = [style.name];
    if (style.description) textParts.push(style.description);
    if (style.promptGuidanceForAI) textParts.push(style.promptGuidanceForAI);

    const textToEmbed = textParts.join(". ");

    const vector = await embed(textToEmbed);
    await ctx.runMutation(internal.internal.styles.addStyleEmbedding, {
      styleId: args.styleId,
      embedding: vector,
    });
  },
});

export const embedTone = internalAction({
  args: {
    toneId: v.id("tones"),
  },
  handler: async (ctx, args) => {
    const tone = await ctx.runQuery(api.core.tones.getTone, {
      id: args.toneId,
    });
    if (!tone) {
      return;
    }
    // Only embed if there is text
    const textToEmbed = tone.name;
    if (!textToEmbed) return;

    const vector = await embed(textToEmbed);
    await ctx.runMutation(internal.internal.tones.addToneEmbedding, {
      toneId: args.toneId,
      embedding: vector,
    });
  },
});
