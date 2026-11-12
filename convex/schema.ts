import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  baseTaxonomyFields,
  lifecycleStatus,
  promptExample,
  qualityRubric,
  questionQualitySnapshot,
  styleVersionFields,
  toneVersionFields,
  topicVersionFields,
} from "./lib/taxonomy";

import { editorialReason, reviewSnapshot } from "./lib/questionReviewValidators";
import { qualityCheckSnapshot } from "./lib/qualityCheck";
import { rateLimitTables } from "convex-helpers/server/rateLimit";

const questionSource = v.union(
  v.literal("ai"),
  v.literal("seed"),
  v.literal("editor"),
);

const generationRunStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
);

const generationRunPurpose = v.union(
  v.literal("feed"),
  v.literal("admin_preview"),
  v.literal("admin_accept"),
  v.literal("nightly_pool"),
  v.literal("newsletter"),
  v.literal("remix"),
  // One call that judges a generated question (internal/qualityCheck.ts). Its run has no
  // prompt label, and names the question it judged as sourceQuestionId.
  v.literal("quality_check"),
);

export default defineSchema({
  // Rows for the AI rate limits (lib/aiRateLimit.ts): convex-helpers token buckets, and the
  // per-spend-day counts (DAY_LIMITS) that file reads and writes itself.
  ...rateLimitTables,
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
    .index("by_userId_questionId_event", ["userId", "questionId", "event"])
    .index("by_questionId_event_timestamp", ["questionId", "event", "timestamp"])
    .index("by_sessionId_questionId_event", ["sessionId", "questionId", "event"])
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
    ...baseTaxonomyFields,
    ...styleVersionFields,
  }).index("by_my_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_slug_status", ["slug", "status"])
    .index("by_slug_version", ["slug", "version"])
    .index("by_status", ["status"])
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
    ...baseTaxonomyFields,
    ...toneVersionFields,
  }).index("by_my_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_slug_status", ["slug", "status"])
    .index("by_slug_version", ["slug", "version"])
    .index("by_status", ["status"])
    .index("by_name", ["name"])
    .index("by_order", ["order"]),
  topics: defineTable({
    id: v.string(), // slug
    name: v.string(),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    example: v.optional(v.string()),
    promptGuidanceForAI: v.optional(v.string()),
    order: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    takeoverStartDate: v.optional(v.number()),
    takeoverEndDate: v.optional(v.number()),
    ...baseTaxonomyFields,
    ...topicVersionFields,
  }).index("by_my_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_slug_status", ["slug", "status"])
    .index("by_slug_version", ["slug", "version"])
    .index("by_status", ["status"])
    .index("by_name", ["name"])
    .index("by_order", ["order"])
    .index("by_startDate_endDate_order", ["startDate", "endDate", "order"])
    .index("by_takeoverStartDate_takeoverEndDate_order", ["takeoverStartDate", "takeoverEndDate", "order"]),
  promptBlueprints: defineTable({
    slug: v.string(),
    version: v.number(),
    status: lifecycleStatus,
    systemInstruction: v.string(),
    safetyChecklist: v.array(v.string()),
    qualityChecklist: v.array(v.string()),
    outputFormatInstruction: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_version", ["slug", "version"])
    .index("by_status", ["status"]),
  generationRuns: defineTable({
    status: generationRunStatus,
    purpose: generationRunPurpose,
    requestedByUserId: v.optional(v.string()),
    // Runs from before the short brief point at the blueprint their prompt was built from.
    blueprintId: v.optional(v.id("promptBlueprints")),
    // Which wording wrote the prompt, like "brief-v2" (lib/brief.ts). A check's run has none.
    promptLabel: v.optional(v.string()),
    styleId: v.optional(v.id("styles")),
    toneId: v.optional(v.id("tones")),
    topicId: v.optional(v.id("topics")),
    styleSlug: v.optional(v.string()),
    toneSlug: v.optional(v.string()),
    topicSlug: v.optional(v.string()),
    styleVersion: v.optional(v.number()),
    toneVersion: v.optional(v.number()),
    topicVersion: v.optional(v.number()),
    batchSize: v.number(),
    model: v.string(),
    provider: v.optional(v.string()),
    temperature: v.number(),
    assembledPrompt: v.string(),
    rawResponse: v.optional(v.string()),
    error: v.optional(v.string()),
    previewText: v.optional(v.string()),
    acceptedQuestionId: v.optional(v.id("questions")),
    sourceQuestionId: v.optional(v.id("questions")),
    resultQuestionIds: v.array(v.id("questions")),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
    // What the provider reported for the completion: the model that ran, token counts and
    // the charge in USD.
    resolvedModel: v.optional(v.string()),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    // What became of the model's answer: questions parsed from it (up to batchSize, which
    // is what was asked for), saved, skipped as duplicates, and rejected by validation.
    parsedCount: v.optional(v.number()),
    insertedCount: v.optional(v.number()),
    duplicateCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_purpose", ["purpose"])
    .index("by_style_tone_topic", ["styleSlug", "toneSlug", "topicSlug"])
    .index("by_requestedByUserId", ["requestedByUserId"]),
  // Daily AI spend (Los Angeles days) for the spend cap. "user" is anything a user
  // can trigger; "system" is the daily email and admin tools.
  aiSpendDays: defineTable({
    day: v.string(),
    spendClass: v.union(v.literal("user"), v.literal("system")),
    costUsd: v.number(),
    calls: v.number(),
  }).index("by_day_class", ["day", "spendClass"]),
  questions: defineTable({
    averageViewDuration: v.number(),
    lastShownAt: v.optional(v.number()),
    text: v.optional(v.string()),
    totalLikes: v.number(),
    totalThumbsDown: v.optional(v.number()),
    totalShows: v.number(),
    isAIGenerated: v.optional(v.boolean()),
    // Set when generation saves a question to wait for review, which every generating path does.
    // Such a pending question is unlisted (open by link); other pending rows stay hidden.
    heldForReview: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    styleId: v.optional(v.id("styles")),
    tone: v.optional(v.string()),
    toneId: v.optional(v.id("tones")),
    topic: v.optional(v.string()),
    topicId: v.optional(v.id("topics")),
    fingerprint: v.optional(v.string()),
    reviewRevision: v.optional(v.number()),
    duplicateOf: v.optional(v.id("questions")),
    duplicateWasPublic: v.optional(v.boolean()),
    source: v.optional(questionSource),
    styleSlug: v.optional(v.string()),
    toneSlug: v.optional(v.string()),
    topicSlug: v.optional(v.string()),
    styleVersion: v.optional(v.number()),
    toneVersion: v.optional(v.number()),
    topicVersion: v.optional(v.number()),
    generationRunId: v.optional(v.id("generationRuns")),
    safetyFlags: v.optional(v.array(v.string())),
    moderationNotes: v.optional(v.string()),
    quality: v.optional(questionQualitySnapshot),
    // The quality check's verdict on a generated question (lib/qualityCheck.ts). It records
    // an opinion; it doesn't change who can see the question.
    qualityCheck: v.optional(qualityCheckSnapshot),
    authorId: v.optional(v.string()),
    customText: v.optional(v.string()),
    kind: v.optional(v.literal("personal")),
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
    imageStorageId: v.optional(v.id("_storage")),
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
    .index("by_styleId_status", ["styleId", "status"])
    .index("by_toneId_status", ["toneId", "status"])
    .index("by_topicId_status", ["topicId", "status"])
    .index("by_status", ["status"])
    .index("by_style_and_last_shown", ["styleId", "lastShownAt"])
    .index("by_style_and_total_likes", ["styleId", "totalLikes"])
    .index("by_tone_and_last_shown", ["toneId", "lastShownAt"])
    .index("by_tone_and_total_likes", ["toneId", "totalLikes"])
    .index("by_style_and_tone", ["styleId", "toneId"])
    .index("by_tone_text", ["tone"])
    .index("by_text", ["text"])
    .index("by_fingerprint", ["fingerprint"])
    .index("by_duplicateOf", ["duplicateOf"])
    .index("by_generationRun", ["generationRunId"])
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
    clerkId: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAdmin: v.optional(v.boolean()),
    defaultStyle: v.optional(v.string()),
    defaultTone: v.optional(v.string()),
    dismissedRefineCTA: v.optional(v.boolean()),
    billingSubjectType: v.optional(v.literal("user")),
    billingStatus: v.optional(v.union(
      v.literal("inactive"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("trialing")
    )),
    clerkCustomerId: v.optional(v.string()),
    clerkSubscriptionId: v.optional(v.string()),
    aiUsage: v.optional(v.object({
      count: v.number(),
      cycleStart: v.number(),
    })),
    newsletterSubscriptionStatus: v.optional(v.union(v.literal("subscribed"), v.literal("unsubscribed"))),
    newsletterUnsubscribeToken: v.optional(v.string()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_newsletterUnsubscribeToken", ["newsletterUnsubscribeToken"])
    .index("by_newsletterSubscriptionStatus", ["newsletterSubscriptionStatus"]),
  userAiUsage: defineTable({
    userId: v.id("users"),
    count: v.number(),
    cycleStart: v.number(),
  })
    .index("by_userId", ["userId"]),
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
  questionReviews: defineTable({
    reviewer: v.string(),
    reason: v.string(),
    outcome: v.union(v.literal("flag"), v.literal("keep"), v.literal("prune"), v.literal("edit"), v.literal("remix"), v.literal("duplicates"), v.literal("reject_duplicates")),
    source: v.union(v.literal("pruning"), v.literal("duplicates"), v.literal("question")),
    pruningId: v.optional(v.id("pruning")),
    detectionId: v.optional(v.id("duplicateDetections")),
    undoable: v.boolean(),
    undoneAt: v.optional(v.number()),
    undoneBy: v.optional(v.string()),
  }).index("by_source", ["source"]),
  questionReviewChanges: defineTable({
    reviewId: v.id("questionReviews"),
    questionId: v.id("questions"),
    before: reviewSnapshot,
    after: reviewSnapshot,
  }).index("by_reviewId", ["reviewId"]),
  pruning: defineTable({
    questionId: v.id("questions"),
    userId: v.optional(v.id("users")), // Optional, as some pruning might be global
    editorialReasons: v.optional(v.array(editorialReason)),
    editorialNotes: v.optional(v.string()),
    flaggedBy: v.optional(v.string()),
    reviewedRevision: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
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
  feedback: defineTable({
    text: v.string(),
    pageUrl: v.string(),
    submissionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
  })
    .index("by_status", ["status"])
    .index("by_submissionId", ["submissionId"])
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"]),
  pendingSubscriptions: defineTable({
    email: v.string(),
    token: v.string(),
  }).index("by_token", ["token"]),
  newsletterDeliveries: defineTable({
    deliveryDate: v.string(),
    email: v.string(),
    userId: v.id("users"),
    questionId: v.optional(v.id("questions")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("sent"),
      v.literal("failed")
    ),
    attemptCount: v.number(),
    resendEmailId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    claimedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
  })
    .index("by_deliveryDate", ["deliveryDate"])
    .index("by_deliveryDate_email", ["deliveryDate", "email"])
    .index("by_deliveryDate_status", ["deliveryDate", "status"])
    .index("by_userId_deliveryDate", ["userId", "deliveryDate"]),
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

  // Embedding tables (one-to-one with parent; embeddings only, to reduce bandwidth on main tables)
  question_embeddings: defineTable({
    questionId: v.id("questions"),
    embedding: v.array(v.float64()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("public"),
      v.literal("private"),
      v.literal("pruning"),
      v.literal("pruned")
    )),
    styleId: v.optional(v.id("styles")),
    toneId: v.optional(v.id("tones")),
    topicId: v.optional(v.id("topics")),
  })
    .index("by_questionId", ["questionId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 384,
      filterFields: ["status", "styleId", "toneId", "topicId"],
    }),
  style_embeddings: defineTable({
    styleId: v.id("styles"),
    embedding: v.array(v.float64()),
  }).index("by_styleId", ["styleId"]),
  tone_embeddings: defineTable({
    toneId: v.id("tones"),
    embedding: v.array(v.float64()),
  }).index("by_toneId", ["toneId"]),
  topic_embeddings: defineTable({
    topicId: v.id("topics"),
    embedding: v.array(v.float64()),
  }).index("by_topicId", ["topicId"]),
  user_embeddings: defineTable({
    userId: v.id("users"),
    embedding: v.array(v.float64()),
  }).index("by_userId", ["userId"]),

  // ---- Zombie slug reports ----
  zombieSlugReports: defineTable({
    scanTime: v.number(),
    totalZombieSlugs: v.number(),
    totalAffectedQuestions: v.number(),
  }),
  zombieSlugReportDetails: defineTable({
    reportId: v.id("zombieSlugReports"),
    slug: v.string(),
    type: v.string(),
    count: v.number(),
  }).index("by_reportId", ["reportId"]),
});
