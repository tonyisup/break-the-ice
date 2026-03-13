import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  defaultIdealPromptLength,
  defaultQualityRubric,
} from "./taxonomy";

export const styleFields = {
  _id: v.id("styles"),
  _creationTime: v.number(),
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  structure: v.string(),
  structuralInstruction: v.string(),
  color: v.string(),
  icon: v.string(),
  promptGuidanceForAI: v.optional(v.string()),
  aiGuidance: v.string(),
  example: v.optional(v.string()),
  order: v.optional(v.float64()),
  organizationId: v.optional(v.id("organizations")),
  version: v.number(),
  status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  commonFailureModes: v.array(v.string()),
  distinctFrom: v.array(v.string()),
  examples: v.array(v.object({ text: v.string(), note: v.optional(v.string()) })),
  antiExamples: v.array(v.object({ text: v.string(), note: v.optional(v.string()) })),
  quality: v.object({
    distinctness: v.number(),
    generativity: v.number(),
    readability: v.number(),
    pairability: v.number(),
    storyYield: v.number(),
    safety: v.number(),
    embeddingValue: v.number(),
  }),
  cognitiveMove: v.string(),
  socialFunction: v.string(),
  answerShape: v.string(),
  idealPromptLength: v.object({
    minChars: v.number(),
    maxChars: v.number(),
  }),
  riskLevel: v.union(v.literal("low"), v.literal("medium")),
};

export function mapStyle(style: Doc<"styles">) {
  const slug = style.slug ?? style.id;
  const promptGuidanceForAI = style.promptGuidanceForAI ?? style.aiGuidance ?? "";
  const structuralInstruction = style.structuralInstruction ?? style.structure ?? "";

  return {
    _id: style._id,
    _creationTime: style._creationTime,
    id: slug,
    slug,
    name: style.name,
    description: style.description,
    structure: style.structure ?? structuralInstruction,
    structuralInstruction,
    color: style.color,
    icon: style.icon,
    promptGuidanceForAI,
    aiGuidance: style.aiGuidance ?? promptGuidanceForAI,
    example: style.example,
    order: style.order,
    organizationId: style.organizationId,
    version: style.version ?? 1,
    status: style.status ?? "active",
    commonFailureModes: style.commonFailureModes ?? [],
    distinctFrom: style.distinctFrom ?? [],
    examples: style.examples ?? [],
    antiExamples: style.antiExamples ?? [],
    quality: style.quality ?? defaultQualityRubric(),
    cognitiveMove: style.cognitiveMove ?? "reflect",
    socialFunction:
      style.socialFunction ?? "Reveals taste and priorities through conversation.",
    answerShape: style.answerShape ?? "short conversational answer",
    idealPromptLength: style.idealPromptLength ?? defaultIdealPromptLength(),
    riskLevel: style.riskLevel ?? "low",
  };
}
