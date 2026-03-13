import { v } from "convex/values";

export const lifecycleStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const promptExample = v.object({
  text: v.string(),
  note: v.optional(v.string()),
});

export const qualityRubric = v.object({
  distinctness: v.number(),
  generativity: v.number(),
  readability: v.number(),
  pairability: v.number(),
  storyYield: v.number(),
  safety: v.number(),
  embeddingValue: v.number(),
});

export const questionQualitySnapshot = v.object({
  readability: v.optional(v.number()),
  specificity: v.optional(v.number()),
  storyYield: v.optional(v.number()),
  safety: v.optional(v.number()),
  embeddingValue: v.optional(v.number()),
});

export const toneAxes = v.object({
  warmth: v.number(),
  playfulness: v.number(),
  seriousness: v.number(),
  surrealness: v.number(),
  sharpness: v.number(),
  intimacy: v.number(),
});

export const idealPromptLength = v.object({
  minChars: v.number(),
  maxChars: v.number(),
});

export const baseTaxonomyFields = {
  slug: v.optional(v.string()),
  status: v.optional(lifecycleStatus),
  version: v.optional(v.number()),
  aiGuidance: v.optional(v.string()),
  safetyNotes: v.optional(v.string()),
  commonFailureModes: v.optional(v.array(v.string())),
  distinctFrom: v.optional(v.array(v.string())),
  examples: v.optional(v.array(promptExample)),
  antiExamples: v.optional(v.array(promptExample)),
  quality: v.optional(qualityRubric),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
};

export const styleVersionFields = {
  cognitiveMove: v.optional(v.string()),
  socialFunction: v.optional(v.string()),
  structuralInstruction: v.optional(v.string()),
  answerShape: v.optional(v.string()),
  idealPromptLength: v.optional(idealPromptLength),
  riskLevel: v.optional(v.union(v.literal("low"), v.literal("medium"))),
};

export const toneVersionFields = {
  languageCues: v.optional(v.array(v.string())),
  avoidCues: v.optional(v.array(v.string())),
  emotionalAxes: v.optional(toneAxes),
};

export const topicVersionFields = {
  scopeBoundaries: v.optional(v.array(v.string())),
  referencePool: v.optional(v.array(v.string())),
  accessibilityNotes: v.optional(v.string()),
};

export function defaultQualityRubric() {
  return {
    distinctness: 3,
    generativity: 3,
    readability: 3,
    pairability: 3,
    storyYield: 3,
    safety: 4,
    embeddingValue: 3,
  };
}

export function defaultToneAxesValue() {
  return {
    warmth: 3,
    playfulness: 3,
    seriousness: 2,
    surrealness: 1,
    sharpness: 2,
    intimacy: 2,
  };
}

export function defaultIdealPromptLength() {
  return {
    minChars: 40,
    maxChars: 160,
  };
}

export function latestActiveVersion<T extends { status?: string; version?: number }>(
  docs: T[],
): T | null {
  const active = docs
    .filter((doc) => (doc.status ?? "active") === "active")
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1));

  return active[0] ?? null;
}

export function latestVersion<T extends { version?: number }>(docs: T[]): T | null {
  return [...docs].sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0] ?? null;
}

export function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(getKey(item), item);
  }
  return Array.from(map.values());
}
