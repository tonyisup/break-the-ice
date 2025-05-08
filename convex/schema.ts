import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  questions: defineTable({
    text: v.string(),
    lastShownAt: v.optional(v.number()),
    totalLikes: v.number(),
    totalShows: v.number(),
    averageViewDuration: v.number(), // in milliseconds
  })
    .index("by_last_shown_at", ["lastShownAt"])
    .index("by_average_view_duration", ["averageViewDuration"])
    .index("by_total_likes", ["totalLikes"]),
  analytics: defineTable({
    questionId: v.id("questions"),
    event: v.union(v.literal("like"), v.literal("discard")),
    viewDuration: v.number(), // in milliseconds
    timestamp: v.number(),
  }),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
