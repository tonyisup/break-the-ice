import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  analytics: defineTable({
    event: v.union(
      v.literal("seen"),
      v.literal("liked"),
      v.literal("shared"),
      v.literal("hidden"),
    ),
    questionId: v.id("questions"),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.string()),
    timestamp: v.float64(),
    viewDuration: v.float64(),
  }).index("by_userId_event_timestamp", ["userId", "event", "timestamp"])
    .index("by_questionId_event_timestamp", ["questionId", "event", "timestamp"])
    .index("by_sessionId_timestamp", ["sessionId", "timestamp"])
    .index("by_timestamp", ["timestamp"]),
  styles: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    structure: v.string(),
    color: v.string(),
    icon: v.string(),
    promptGuidanceForAI: v.optional(v.string()),
    example: v.optional(v.string()),
    order: v.optional(v.number()),
    embedding: v.optional(v.array(v.number())),
  }).index("by_name", ["name"])
    .index("by_order", ["order"]),
  tones: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    icon: v.string(),
    promptGuidanceForAI: v.string(),
    order: v.optional(v.number()),
    embedding: v.optional(v.array(v.number())),
  }).index("by_name", ["name"])
    .index("by_order", ["order"]),
  questions: defineTable({
    averageViewDuration: v.number(),
    lastShownAt: v.optional(v.number()),
    text: v.optional(v.string()),
    totalLikes: v.number(),
    totalThumbsDown: v.optional(v.number()),
    totalShows: v.number(),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    embedding: v.optional(v.array(v.number())),
    authorId: v.optional(v.string()),
    customText: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("personal"),
        v.literal("pruning"),
        v.literal("pruned")
      )
    ),
    prunedAt: v.optional(v.number()),
  })
    .index("by_average_view_duration", [
      "averageViewDuration",
    ])
    .index("by_last_shown_at", ["lastShownAt"])
    .index("by_total_likes", ["totalLikes"])
    .index("by_tags", ["tags"])
    .index("by_style", ["style"])
    .index("by_tone", ["tone"])
    .index("by_style_and_last_shown", ["style", "lastShownAt"])
    .index("by_style_and_total_likes", ["style", "totalLikes"])
    .index("by_tone_and_last_shown", ["tone", "lastShownAt"])
    .index("by_tone_and_total_likes", ["tone", "totalLikes"])
    .index("by_style_and_tone", ["style", "tone"])
    .index("by_text", ["text"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 384,
      filterFields: ["style", "tone"],
    })
    .index("by_author", ["authorId", "status"]),
  tags: defineTable({
    name: v.string(),
    grouping: v.string(),
    description: v.optional(v.string()),
  })
    .index("by_grouping", ["grouping"]),
  users: defineTable({
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAdmin: v.optional(v.boolean()),
    migratedFromLocalStorage: v.optional(v.boolean()),
    questionPreferenceEmbedding: v.optional(v.array(v.number())),
    defaultStyle: v.optional(v.string()),
    defaultTone: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  userQuestions: defineTable({
    userId: v.id("users"),
    questionId: v.id("questions"),
    status: v.union(
      v.literal("seen"),
      v.literal("liked"),
      v.literal("hidden")
    ),
    viewDuration: v.optional(v.number()),
    seenCount: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_questionId", ["questionId"])
    .index("by_status", ["status"])
    .index("by_userIdAndStatus", ["userId", "status"])
    .index("by_questionIdAndStatus", ["questionId", "status"])
    .index("by_userIdAndQuestionId", ["userId", "questionId"]),
  userStyles: defineTable({
    userId: v.id("users"),
    styleId: v.string(),
    status: v.union(
      v.literal("default"),
      v.literal("preferred"),
      v.literal("hidden")
    ),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_styleId", ["styleId"])
    .index("by_status", ["status"])
    .index("by_userIdAndStatus", ["userId", "status"])
    .index("by_userIdAndStyleId", ["userId", "styleId"]),

  userTones: defineTable({
    userId: v.id("users"),
    toneId: v.string(),
    status: v.union(
      v.literal("default"),
      v.literal("preferred"),
      v.literal("hidden")
    ),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_toneId", ["toneId"])
    .index("by_status", ["status"])
    .index("by_userIdAndStatus", ["userId", "status"])
    .index("by_userIdAndToneId", ["userId", "toneId"]),
  duplicateDetections: defineTable({
    questionIds: v.array(v.id("questions")),
    reason: v.string(),
    confidence: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("approved")
    ),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_detected_at", ["detectedAt"])
    .index("by_status_and_confidence", ["status", "confidence"]),
  duplicateDetectionProgress: defineTable({
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    totalQuestions: v.number(),
    processedQuestions: v.number(),
    duplicatesFound: v.number(),
    currentBatch: v.number(),
    totalBatches: v.number(),
    errors: v.array(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_started_at", ["startedAt"]),
  pruning: defineTable({
    questionId: v.id("questions"),
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reason: v.string(),
    prunedAt: v.number(),
  })
});
