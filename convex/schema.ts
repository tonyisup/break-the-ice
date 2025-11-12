import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  analytics: defineTable({
    event: v.union(v.literal("like"), v.literal("discard")),
    questionId: v.id("questions"),
    timestamp: v.float64(),
    viewDuration: v.float64(),
  }),
  authAccounts: defineTable({
    emailVerified: v.optional(v.string()),
    phoneVerified: v.optional(v.string()),
    provider: v.string(),
    providerAccountId: v.string(),
    secret: v.optional(v.string()),
    userId: v.id("users"),
  })
    .index("providerAndAccountId", [
      "provider",
      "providerAccountId",
    ])
    .index("userIdAndProvider", ["userId", "provider"]),
  authRateLimits: defineTable({
    attemptsLeft: v.float64(),
    identifier: v.string(),
    lastAttemptTime: v.float64(),
  }).index("identifier", ["identifier"]),
  authRefreshTokens: defineTable({
    expirationTime: v.float64(),
    firstUsedTime: v.optional(v.float64()),
    parentRefreshTokenId: v.optional(
      v.id("authRefreshTokens")
    ),
    sessionId: v.id("authSessions"),
  })
    .index("sessionId", ["sessionId"])
    .index("sessionIdAndParentRefreshTokenId", [
      "sessionId",
      "parentRefreshTokenId",
    ]),
  authSessions: defineTable({
    expirationTime: v.float64(),
    userId: v.id("users"),
  }).index("userId", ["userId"]),
  authVerificationCodes: defineTable({
    accountId: v.id("authAccounts"),
    code: v.string(),
    emailVerified: v.optional(v.string()),
    expirationTime: v.float64(),
    phoneVerified: v.optional(v.string()),
    provider: v.string(),
    verifier: v.optional(v.string()),
  })
    .index("accountId", ["accountId"])
    .index("code", ["code"]),
  authVerifiers: defineTable({
    sessionId: v.optional(v.id("authSessions")),
    signature: v.optional(v.string()),
  }).index("signature", ["signature"]),
  models: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    nsfw: v.boolean(),
  }).index("name", ["name"]),
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
  }).index("name", ["name"])
    .index("id", ["id"])
    .index("by_order", ["order"]),
  tones: defineTable({
    id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.string(),
    icon: v.string(),
    promptGuidanceForAI: v.string(),
    order: v.optional(v.number()),
  }).index("name", ["name"])
    .index("id", ["id"])
    .index("by_order", ["order"]),
  questions: defineTable({
    averageViewDuration: v.number(),
    lastShownAt: v.optional(v.number()),
    text: v.string(),
    totalLikes: v.number(),
    totalThumbsDown: v.optional(v.number()),
    totalShows: v.number(),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    embedding: v.optional(v.array(v.number())),
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
      dimensions: 1536,
    }),
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
    questionHistory: v.optional(v.array(v.id("questions"))),
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
    status: v.union(v.literal("liked"), v.literal("hidden")),
    updatedAt: v.number(),
  })
    .index("userId", ["userId"])
    .index("questionId", ["questionId"])
    .index("status", ["status"])
    .index("userIdAndStatus", ["userId", "status"])
    .index("questionIdAndStatus", ["questionId", "status"])
    .index("userIdAndQuestionId", ["userId", "questionId"]),
  userHiddenStyles: defineTable({
    userId: v.id("users"),
    styleId: v.string(),
    updatedAt: v.number(),
  })
    .index("userId", ["userId"])
    .index("styleId", ["styleId"])
    .index("userIdAndStyleId", ["userId", "styleId"]),
  userHiddenTones: defineTable({
    userId: v.id("users"),
    toneId: v.string(),
    updatedAt: v.number(),
  })
    .index("userId", ["userId"])
    .index("toneId", ["toneId"])
    .index("userIdAndToneId", ["userId", "toneId"]),
  duplicateDetections: defineTable({
    questionIds: v.array(v.id("questions")),
    reason: v.string(),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("deleted")),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_detected_at", ["detectedAt"])
    .index("by_status_and_confidence", ["status", "confidence"]),
  duplicateDetectionProgress: defineTable({
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
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
});
