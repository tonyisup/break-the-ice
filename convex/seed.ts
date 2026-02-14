import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedTakeover = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const topicId = await ctx.db.insert("topics", {
      id: "takeover-test",
      name: "Takeover Test Topic",
      icon: "Sparkles",
      description: "This is a test topic for takeover verification",
      takeoverStartDate: now - 1000000,
      takeoverEndDate: now + 1000000,
    });

    await ctx.db.insert("questions", {
      text: "Is this a takeover question?",
      topicId: topicId,
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});
