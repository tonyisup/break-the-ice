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
    organizationId: v.optional(v.id("organizations")),
  }).index("by_my_id", ["id"])
    .index("by_name", ["name"])
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
    organizationId: v.optional(v.id("organizations")),
  }).index("by_my_id", ["id"])
    .index("by_name", ["name"])
    .index("by_order", ["order"]),
  topics: defineTable({
    id: v.string(), // slug
    name: v.string(),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    embedding: v.optional(v.array(v.number())),
    order: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    takeoverStartDate: v.optional(v.number()),
    takeoverEndDate: v.optional(v.number()),
  }).index("by_my_id", ["id"])
    .index("by_name", ["name"])
    .index("by_order", ["order"])
    .index("by_startDate_endDate_order", ["startDate", "endDate", "order"])
    .index("by_takeoverStartDate_takeoverEndDate_order", ["takeoverStartDate", "takeoverEndDate", "order"]),
  questions: defineTable({
    organizationId: v.optional(v.id("organizations")),
    averageViewDuration: v.number(),
    lastShownAt: v.optional(v.number()),
    text: v.optional(v.string()),
    totalLikes: v.number(),
    totalThumbsDown: v.optional(v.number()),
    totalShows: v.number(),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    styleId: v.optional(v.id("styles")),
    tone: v.optional(v.string()),
    toneId: v.optional(v.id("tones")),
    topic: v.optional(v.string()),
    topicId: v.optional(v.id("topics")),
    embedding: v.optional(v.array(v.number())),
    authorId: v.optional(v.string()),
    customText: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("public"),
        v.literal("private"),
        v.literal("pruning"),
        v.literal("pruned")
      )
    ),
    prunedAt: v.optional(v.number()),
    lastPostedAt: v.optional(v.number()),
    // Pool tracking for nightly AI generation
    poolDate: v.optional(v.string()), // ISO date string, e.g. "2026-01-30"
    poolStatus: v.optional(v.union(
      v.literal("available"),   // Ready for assignment to users
      v.literal("distributed")  // Already assigned to users
    )),
  })
    .index("by_last_posted_at", ["lastPostedAt"])
    .index("by_status_and_last_posted", ["status", "lastPostedAt"])
    .index("by_average_view_duration", [
      "averageViewDuration",
    ])
    .index("by_last_shown_at", ["lastShownAt"])
    .index("by_total_likes", ["totalLikes"])
    .index("by_tags", ["tags"])
    .index("by_style", ["styleId"])
    .index("by_tone", ["toneId"])
    .index("by_topic", ["topicId"])
    .index("by_style_and_last_shown", ["styleId", "lastShownAt"])
    .index("by_style_and_total_likes", ["styleId", "totalLikes"])
    .index("by_tone_and_last_shown", ["toneId", "lastShownAt"])
    .index("by_tone_and_total_likes", ["toneId", "totalLikes"])
    .index("by_style_and_tone", ["styleId", "toneId"])
    .index("by_text", ["text"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 384,
      filterFields: ["status", "styleId", "toneId"],
    })
    .index("by_author", ["authorId", "status"])
    .index("by_prunedAt_status_text", ["prunedAt", "status", "text"])
    .index("by_poolDate_and_poolStatus", ["poolDate", "poolStatus"]),
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
    questionPreferenceEmbedding: v.optional(v.array(v.number())),
    defaultStyle: v.optional(v.string()),
    defaultTone: v.optional(v.string()),
    dismissedRefineCTA: v.optional(v.boolean()),
    subscriptionTier: v.optional(v.union(v.literal("free"), v.literal("casual"))),
    aiUsage: v.optional(v.object({
      count: v.number(),
      cycleStart: v.number(),
    })),
    newsletterSubscriptionStatus: v.optional(v.union(v.literal("subscribed"), v.literal("unsubscribed"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_newsletterSubscriptionStatus", ["newsletterSubscriptionStatus"]),
  userQuestions: defineTable({
    userId: v.id("users"),
    questionId: v.id("questions"),
    status: v.union(
      v.literal("unseen"),
      v.literal("seen"),
      v.literal("liked"),
      v.literal("hidden"),
      v.literal("sent")
    ),
    viewDuration: v.optional(v.number()),
    seenCount: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_questionId", ["questionId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_status_updatedAt", ["userId", "status", "updatedAt"])
    .index("by_questionIdAndStatus", ["questionId", "status"])
    .index("by_userIdAndQuestionId", ["userId", "questionId"]),
  userStyles: defineTable({
    userId: v.id("users"),
    styleId: v.id("styles"),
    status: v.union(
      v.literal("preferred"),
      v.literal("hidden")
    ),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_styleId", ["styleId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userIdAndStyleId", ["userId", "styleId"]),

  userTones: defineTable({
    userId: v.id("users"),
    toneId: v.id("tones"),
    status: v.union(
      v.literal("preferred"),
      v.literal("hidden")
    ),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_toneId", ["toneId"])
    .index("by_status", ["status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userIdAndToneId", ["userId", "toneId"]),
  duplicateDetections: defineTable({
    questionIds: v.array(v.id("questions")),
    uniqueKey: v.optional(v.string()), // Combined ID of the questions (sorted) to prevent duplicate entries
    reason: v.string(),
    confidence: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("approved")
    ),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_status_and_confidence", ["status", "confidence"])
    .index("by_uniqueKey", ["uniqueKey"]),
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
    completedAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_status", ["status"]),
  pruning: defineTable({
    questionId: v.id("questions"),
    userId: v.optional(v.id("users")), // Optional, as some pruning might be global
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reason: v.string(),
    metrics: v.optional(v.object({
      totalShows: v.number(),
      totalLikes: v.number(),
      averageViewDuration: v.number(),
      hiddenCount: v.number(),
      styleSimilarity: v.optional(v.number()),
      toneSimilarity: v.optional(v.number()),
    })),
    prunedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_questionId", ["questionId"])
    .index("by_questionId_and_status", ["questionId", "status"]),
  organizations: defineTable({
    name: v.string(),
  }),
  organization_members: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member")
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_userId_organizationId", ["userId", "organizationId"]),
  invitations: defineTable({
    email: v.string(),
    organizationId: v.id("organizations"),
    role: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member")
    ),
  }).index("by_email", ["email"]),
  collections: defineTable({
    name: v.string(),
    organizationId: v.id("organizations"),
  }).index("by_organizationId", ["organizationId"]),
  question_collections: defineTable({
    questionId: v.id("questions"),
    collectionId: v.id("collections"),
  })
    .index("by_questionId", ["questionId"])
    .index("by_collectionId", ["collectionId"]),
  feedback: defineTable({
    text: v.string(),
    pageUrl: v.string(),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"]),
  pendingSubscriptions: defineTable({
    email: v.string(),
    token: v.string(),
  }).index("by_token", ["token"]),
  pruningSettings: defineTable({
    name: v.string(),
    status: v.union(
      v.literal("default"),
      v.literal("custom")
    ),
    minShowsForEngagement: v.number(),
    minLikeRate: v.number(),
    minShowsForAvgDuration: v.number(),
    minAvgViewDuration: v.number(),
    minHiddenCount: v.number(),
    minHiddenRate: v.number(),
    minStyleSimilarity: v.number(),
    minToneSimilarity: v.number(),
    enableToneCheck: v.boolean(),
  }).index("by_status", ["status"]),
});
