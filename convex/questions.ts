import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const discardQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    startTime: v.number(),
  },
  handler: async (ctx, args) => {
    const { questionId, startTime } = args;

    const question = await ctx.db.get(questionId);
    if (question) {

      const analytics = ctx.db.insert("analytics", {
        questionId,
        viewDuration: Date.now() - startTime,
        event: "discard",
        timestamp: Date.now(),
      });

      const updateQuestion = ctx.db.patch(questionId, {
        totalShows: question.totalShows + 1,
        lastShownAt: Date.now(),
      });

      await Promise.all([analytics, updateQuestion]);
    }
  },
});
export const getNextQuestions = query({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const { count } = args;

    // Build a candidate pool from multiple indexes to avoid full scans.
    const now = Date.now();
    const candidatePoolSize = Math.max(count * 5, 100);

    const [oldest, mostLiked, longestView] = await Promise.all([
      ctx.db
        .query("questions")
        .withIndex("by_last_shown_at")
        .order("asc")
        .take(candidatePoolSize),
      ctx.db
        .query("questions")
        .withIndex("by_total_likes")
        .order("desc")
        .take(candidatePoolSize),
      ctx.db
        .query("questions")
        .withIndex("by_average_view_duration")
        .order("desc")
        .take(candidatePoolSize),
    ]);

    const idToQuestion = new Map<string, Doc<"questions">>();
    for (const q of [...oldest, ...mostLiked, ...longestView]) {
      idToQuestion.set(q._id, q);
    }
    const candidates: Array<Doc<"questions">> = Array.from(idToQuestion.values());

    if (candidates.length === 0) {
      return await ctx.db
        .query("questions")
        .withIndex("by_last_shown_at")
        .order("asc")
        .take(count);
    }

    // Feature extraction
    const computeAgeMs = (q: Doc<"questions">): number => {
      const lastShown = q.lastShownAt ?? 0; // unseen => very old
      return now - lastShown;
    };

    let minAge = Infinity,
      maxAge = -Infinity,
      minLikes = Infinity,
      maxLikes = -Infinity,
      minDur = Infinity,
      maxDur = -Infinity;

    for (const q of candidates) {
      const age = computeAgeMs(q);
      const likes = q.totalLikes ?? 0;
      const dur = q.averageViewDuration ?? 0;
      if (age < minAge) minAge = age;
      if (age > maxAge) maxAge = age;
      if (likes < minLikes) minLikes = likes;
      if (likes > maxLikes) maxLikes = likes;
      if (dur < minDur) minDur = dur;
      if (dur > maxDur) maxDur = dur;
    }

    const normalize = (value: number, min: number, max: number): number => {
      if (!isFinite(min) || !isFinite(max) || max === min) return 1;
      return (value - min) / (max - min);
    };

    // Weights: prioritize older recency, then likes, then view duration.
    const alpha = 0.5; // age
    const beta = 0.3; // likes
    const gamma = 0.2; // view duration

    const weights: Array<number> = candidates.map((q) => {
      const ageNorm = normalize(computeAgeMs(q), minAge, maxAge);
      const likesNorm = normalize(q.totalLikes ?? 0, minLikes, maxLikes);
      const durNorm = normalize(q.averageViewDuration ?? 0, minDur, maxDur);
      const w = alpha * ageNorm + beta * likesNorm + gamma * durNorm;
      return Math.max(w, 1e-6); // guard against zero
    });

    // Weighted sampling without replacement
    const selected: Array<Doc<"questions">> = [];
    const mutableCandidates = candidates.slice();
    const mutableWeights = weights.slice();
    while (selected.length < count && mutableCandidates.length > 0) {
      const total = mutableWeights.reduce((sum, w) => sum + w, 0);
      let r = Math.random() * total;
      let idx = 0;
      while (idx < mutableWeights.length && r >= mutableWeights[idx]) {
        r -= mutableWeights[idx];
        idx += 1;
      }
      if (idx >= mutableCandidates.length) idx = mutableCandidates.length - 1;
      selected.push(mutableCandidates[idx]);
      mutableCandidates.splice(idx, 1);
      mutableWeights.splice(idx, 1);
    }

    // If we still need more, fall back to oldest by lastShownAt
    if (selected.length < count) {
      const fallback = await ctx.db
        .query("questions")
        .withIndex("by_last_shown_at")
        .order("asc")
        .take(count - selected.length);
      const selectedIds = new Set(selected.map((q) => q._id));
      for (const q of fallback) {
        if (!selectedIds.has(q._id) && selected.length < count) {
          selected.push(q);
        }
      }
    }

    return selected;
  }
})

export const recordAnalytics = mutation({
  args: {
    questionId: v.id("questions"),
    event: v.union(v.literal("like"), v.literal("discard")),
    viewDuration: v.number(),
  },
  handler: async (ctx, args) => {
    const { questionId, event, viewDuration } = args;
    const question = await ctx.db.get(questionId);
    if (!question) return;

    await ctx.db.insert("analytics", {
      questionId,
      event,
      viewDuration,
      timestamp: Date.now(),
    });

    if (event === "like") {
      await ctx.db.patch(questionId, {
        totalLikes: question.totalLikes + 1,
      });
    }

    // Update average view duration
    const newAverage =
      (question.averageViewDuration * question.totalShows + viewDuration) /
      (question.totalShows + 1);

    await ctx.db.patch(questionId, {
      averageViewDuration: newAverage,
    });
  },
});

export const getQuestionsByIds = query({
  args: {
    ids: v.array(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const { ids } = args;
    const questions = await Promise.all(
      ids.map((id) => ctx.db.get(id))
    );
    return questions.filter((q): q is Doc<"questions"> => q !== null);
  },
});

// Save the generated AI question to the database
export const saveAIQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.array(v.string()),
    promptUsed: v.string(),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const { text, tags, promptUsed } = args;
    const oldestQuestion = await getOldestQuestion(ctx);
    const lastShownAt = oldestQuestion ? oldestQuestion[0]?.lastShownAt ?? 0 : 0;
    return await ctx.db.insert("questions", {
      text,
      tags,
      promptUsed,
      isAIGenerated: true,
      // Seed lastShownAt with a small negative value so it is included
      // at the front of the by_last_shown_at ascending index and shows up immediately.
      lastShownAt: lastShownAt - 1,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

async function getOldestQuestion(ctx: QueryCtx) {
  return await ctx.db.query("questions").withIndex("by_last_shown_at").order("asc").take(1);
}

const ensureAdmin = async (ctx: QueryCtx | { auth: any; db: any }) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q: any) => q.eq("email", identity.email!))
    .unique();

  if (!user || !user.isAdmin) {
    throw new Error("Not an admin");
  }
  return user;
}

export const getQuestions = query({
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    return await ctx.db.query("questions").collect();
  },
});

export const createQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { text, tags } = args;
    return await ctx.db.insert("questions", {
      text,
      tags,
      isAIGenerated: false,
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

export const updateQuestion = mutation({
  args: {
    id: v.id("questions"),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { id, text, tags } = args;
    await ctx.db.patch(id, { text, tags });
  },
});

export const deleteQuestion = mutation({
  args: {
    id: v.id("questions"),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
