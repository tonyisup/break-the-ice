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
  // The one line the generator and the judge read about this entry (lib/brief.ts). Until an
  // entry has one, they read its description.
  brief: v.optional(v.string()),
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
  // Set only for a style whose form is the style, like either/or: every question keeps it.
  form: v.optional(v.string()),
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

/**
 * Highest version first. A row with no version loses to any numbered one, and of two alike the
 * newer wins: a row from before versions existed used to tie with version 1 and, being older,
 * hide the rewrite.
 */
export function byLatestVersion(
  a: { version?: number; _creationTime?: number },
  b: { version?: number; _creationTime?: number },
): number {
  return (b.version ?? 0) - (a.version ?? 0) || (b._creationTime ?? 0) - (a._creationTime ?? 0);
}

export function latestActiveVersion<T extends { status?: string; version?: number; _creationTime?: number }>(
  docs: T[],
): T | null {
  const active = docs
    .filter((doc) => (doc.status ?? "active") === "active")
    .sort(byLatestVersion);

  return active[0] ?? null;
}

/**
 * What an admin edit saves for an entry's prompt line or set form: the text trimmed, nothing
 * when it was sent blank, and the current value when the form didn't send it at all.
 */
export function editedLine(sent: string | undefined, current: string | undefined): string | undefined {
  if (sent === undefined) return current;
  return sent.trim() || undefined;
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
