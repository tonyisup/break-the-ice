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
  questions: defineTable({
    averageViewDuration: v.float64(),
    lastShownAt: v.optional(v.float64()),
    text: v.string(),
    totalLikes: v.float64(),
    totalShows: v.float64(),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    promptUsed: v.optional(v.string()),
    category: v.optional(v.string()),
  })
    .index("by_average_view_duration", [
      "averageViewDuration",
    ])
    .index("by_last_shown_at", ["lastShownAt"])
    .index("by_total_likes", ["totalLikes"])
    .index("by_tags", ["tags"])
    .index("by_category", ["category"])
    .index("by_category_and_last_shown", ["category", "lastShownAt"])
    .index("by_category_and_total_likes", ["category", "totalLikes"]),
  tags: defineTable({
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
  })
    .index("by_category", ["category"]),
  users: defineTable({
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAdmin: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
});