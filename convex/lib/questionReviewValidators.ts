import { v } from "convex/values";

export const editorialReason = v.union(
  v.literal("awkward_wording"),
  v.literal("unclear_answer"),
  v.literal("style_tone_mismatch"),
  v.literal("repeated_construction"),
);

export const editorialReasonLabels = {
  awkward_wording: "Awkward wording",
  unclear_answer: "Unclear answer",
  style_tone_mismatch: "Style/tone mismatch",
  repeated_construction: "Repeated construction",
} as const;

export const reviewSnapshot = v.object({
  text: v.optional(v.string()),
  fingerprint: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("public"),
      v.literal("private"),
      v.literal("pruning"),
      v.literal("pruned"),
    ),
  ),
  prunedAt: v.optional(v.number()),
  duplicateOf: v.optional(v.id("questions")),
  duplicateWasPublic: v.optional(v.boolean()),
  reviewRevision: v.optional(v.number()),
});
