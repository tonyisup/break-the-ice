import { v } from "convex/values";
import { mutation, query, QueryCtx, internalQuery, internalMutation, internalAction, action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ensureAdmin } from "./auth";
import { embed } from "./lib/retriever";
import { api, internal } from "./_generated/api";

export const calculateAverageEmbedding = (embeddings: number[][]) => {
  const validEmbeddings = embeddings.filter((e) => e && e.length > 0);

  if (validEmbeddings.length === 0) {
    return [];
  }

  const embeddingLength = validEmbeddings[0].length;
  const sumEmbedding = new Array(embeddingLength).fill(0);

  let validCount = 0;
  for (const embedding of validEmbeddings) {
    if (embedding.length !== embeddingLength) {
      console.warn("Embedding length mismatch ignoring:", embedding.length);
      continue;
    }
    for (let i = 0; i < embeddingLength; i++) {
      sumEmbedding[i] += embedding[i];
    }
    validCount++;
  }

  if (validCount === 0) {
    return [];
  }

  return sumEmbedding.map((value) => value / validCount);
};

export const discardQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    startTime: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { questionId, startTime } = args;

    const question = await ctx.db.get(questionId);
    if (question) {

      const analytics = ctx.db.insert("analytics", {
        questionId,
        viewDuration: Date.now() - startTime,
        event: "seen",
        timestamp: Date.now(),
      });

      const updateQuestion = ctx.db.patch(questionId, {
        totalShows: question.totalShows + 1,
        totalThumbsDown: (question.totalThumbsDown ?? 0) + 1,
        lastShownAt: Date.now(),
      });

      await Promise.all([analytics, updateQuestion]);
    }
    return null;
  },
});

export const addPersonalQuestion = mutation({
  args: {
    customText: v.string(),
    authorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let userId;
    if (args.authorId) {
      userId = args.authorId;
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("You must be logged in to add a personal question.");
      }
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email))
        .unique();
      if (!user) {
        throw new Error("User not found.");
      }
      userId = user._id;
    }

    const { customText } = args;
    if (customText.trim().length === 0) {
      // do not save empty questions
      return;
    }
    return await ctx.db.insert("questions", {
      authorId: userId,
      customText,
      status: "pending",
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

function mulberry32(a: number) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
const shuffleArray = (array: any[], seed?: number) => {
  let s = seed ?? Date.now();
  if (seed !== undefined && seed < 1) {
    s = seed * 4294967296;
  }
  const random = mulberry32(s);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export const getSimilarQuestions = query({
  args: {
    count: v.float64(),
    style: v.string(),
    tone: v.string(),
    seen: v.optional(v.array(v.id("questions"))),
    hidden: v.optional(v.array(v.id("questions"))),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<any[]> => {
    const { count, style, tone, seen, hidden, organizationId } = args;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) {
      return [];
    }
    const likedQuestionsDocs = await ctx.db
      .query("userQuestions")
      .withIndex("by_userId_status_updatedAt", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();

    const likedQuestionIds = likedQuestionsDocs.map((uq) => uq.questionId);

    // Use regular query with filter instead of vectorSearch since it's not available in queries
    // Get questions with the same style and tone, then filter by similarity manually
    const candidates = await ctx.db
      .query("questions")
      .withIndex("by_style_and_tone", (q: any) => q.eq("style", style).eq("tone", tone))
      .filter((q: any) => q.eq(q.field("organizationId"), organizationId))
      .filter((q: any) => q.eq(q.field("prunedAt"), undefined))
      .filter((q: any) => q.and(
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
        ...(hidden ?? []).map((id: any) => q.neq(q.field("_id"), id)),
        ...(seen ?? []).map((id: any) => q.neq(q.field("_id"), id)),
        ...likedQuestionIds.map((id: any) => q.neq(q.field("_id"), id))
      ))
      .take(count * 4);

    return candidates;
  },
});

export const getNextRandomQuestions = query({
  args: {
    count: v.float64(),
    seen: v.optional(v.array(v.id("questions"))),
    hidden: v.optional(v.array(v.id("questions"))),
    hiddenStyles: v.optional(v.array(v.id("styles"))),
    hiddenTones: v.optional(v.array(v.id("tones"))),
    organizationId: v.optional(v.id("organizations")),
    randomSeed: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const { count, seen = [], hidden = [], hiddenStyles = [], hiddenTones = [], organizationId, randomSeed } = args;
    const seenIds = new Set(seen);

    // To ensure randomness across refreshes (where seen is empty), we use randomSeed to pick a random starting point.
    // We scan by creation time.
    let startTime = 0;

    if (randomSeed !== undefined) {
      const firstQ = await ctx.db.query("questions").withIndex("by_creation_time").order("asc").first();
      const lastQ = await ctx.db.query("questions").withIndex("by_creation_time").order("desc").first();

      if (firstQ && lastQ) {
        const minTime = firstQ._creationTime;
        const maxTime = lastQ._creationTime;
        if (maxTime > minTime) {
          // Seed the start time based on the random seed [0, 1)
          const normalizedSeed = randomSeed - Math.floor(randomSeed);
          startTime = minTime + normalizedSeed * (maxTime - minTime);
        }
      }
    }

    const applyFilters = (q: any) => {
      return q.and(
        q.eq(q.field("organizationId"), organizationId),
        q.eq(q.field("prunedAt"), undefined),
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
        ...hidden.map((id: Id<"questions">) => q.neq(q.field("_id"), id)),
        ...seen.map((id: Id<"questions">) => q.neq(q.field("_id"), id)),
        ...hiddenStyles.map((styleId: Id<"styles">) => q.neq(q.field("styleId"), styleId)),
        ...hiddenTones.map((toneId: Id<"tones">) => q.neq(q.field("toneId"), toneId))
      );
    };

    // 1. Try fetching from random start point
    const candidates = await ctx.db
      .query("questions")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", startTime))
      .filter((q) => applyFilters(q))
      .take(count * 4);

    // 2. If not enough, wrap around and fetch from beginning
    if (candidates.length < count * 4) {
      const moreCandidates = await ctx.db
        .query("questions")
        .withIndex("by_creation_time") // start from 0
        .filter((q) => applyFilters(q))
        .take(count * 4 - candidates.length);

      // Merge and deduplicate (by ID) just in case overlap occurred
      const existingIds = new Set(candidates.map((q) => q._id));
      for (const q of moreCandidates) {
        if (!existingIds.has(q._id)) {
          candidates.push(q);
          existingIds.add(q._id);
        }
      }
    }

    // Shuffle using the seed to ensure deterministic results for the same request
    const seedForShuffle = randomSeed !== undefined ? randomSeed : Date.now();
    shuffleArray(candidates, seedForShuffle);

    return candidates.slice(0, count);
  },
});

export const getQuestionForNewsletter = query({
  args: {
    userId: v.id("users"),
    randomSeed: v.optional(v.float64()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { userId, randomSeed } = args;
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    // PRIORITY 1: Check for unseen pool questions first
    const unseenUserQuestion = await ctx.db
      .query("userQuestions")
      .withIndex("by_userId_status_updatedAt", (q) =>
        q.eq("userId", userId).eq("status", "unseen")
      )
      .order("asc") // Oldest unseen first
      .first();

    if (unseenUserQuestion) {
      const unseenQuestion = await ctx.db.get(unseenUserQuestion.questionId);
      if (unseenQuestion && !unseenQuestion.prunedAt && unseenQuestion.text) {
        // Return the unseen question - status will be updated via recordAnalytics when viewed
        return unseenQuestion;
      }
    }

    // FALLBACK: Random selection from pool
    // Get seen question IDs
    const userQuestions = await ctx.db.query("userQuestions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const seenIds = new Set(userQuestions.map((uq) => uq.questionId));

    // Get hidden styles
    const userHiddenStyles = await ctx.db.query("userStyles")
      .withIndex("by_userId_status", (q) => q
        .eq("userId", args.userId)
        .eq("status", "hidden")
      )
      .collect();
    const hiddenStyleIds = new Set(userHiddenStyles.map((s) => s.styleId));

    // Get hidden tones
    const userHiddenTones = await ctx.db.query("userTones")
      .withIndex("by_userId_status", (q) => q
        .eq("userId", args.userId)
        .eq("status", "hidden")
      )
      .collect();
    const hiddenToneIds = new Set(userHiddenTones.map((t) => t.toneId));

    // Get candidates - fetch a batch and pick one randomly
    // We filter out hidden styles/tones and seen questions
    const rawCandidates = await ctx.db
      .query("questions")
      .withIndex("by_prunedAt_status_text", (q) => q.eq("prunedAt", undefined))
      .filter((q: any) => q.and(
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined)),
      ))
      .take(1000);

    const candidates = rawCandidates
      .filter((q) => !seenIds.has(q._id))
      .filter((q) => !q.styleId || !hiddenStyleIds.has(q.styleId))
      .filter((q) => !q.toneId || !hiddenToneIds.has(q.toneId))
      .slice(0, 50);

    if (candidates.length === 0) {
      // If we exhausted all questions (or found none matching filters), return null.
      // The caller will handle this (e.g. by generating a new AI question).
      return null;
    }

    // Pick a random question from candidates
    const seed = randomSeed ?? Math.random();
    const normalizedSeed = seed - Math.floor(seed);
    const randomIndex = Math.floor(normalizedSeed * candidates.length);
    return candidates[randomIndex];
  },
})

export const getNextQuestions = query({
  args: {
    count: v.float64(),
    style: v.id("styles"),
    tone: v.id("tones"),
    seen: v.optional(v.array(v.id("questions"))),
    hidden: v.optional(v.array(v.id("questions"))),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { count, style, tone, seen, hidden, organizationId } = args;
    const seenIds = new Set(seen ?? []);

    // Get all questions first, and filter out seen ones.
    const filteredQuestions = await ctx.db
      .query("questions")
      .withIndex("by_style_and_tone", (q) => q.eq("styleId", style).eq("toneId", tone))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .filter((q) => q.eq(q.field("prunedAt"), undefined))
      .filter((q) => q.and(
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), "public"), q.eq(q.field("status"), undefined))
      ))
      .filter((q) => q.and(... (hidden ?? []).map(hiddenId => q.neq(q.field("_id"), hiddenId))))
      .filter((q) => q.and(... (seen ?? []).map(seenId => q.neq(q.field("_id"), seenId))))
      .collect();

    const unseenQuestions = filteredQuestions.filter(q => !seenIds.has(q._id));
    if (unseenQuestions.length > 0) {
      shuffleArray(unseenQuestions);
      return unseenQuestions.slice(0, count).map(({ embedding, ...question }) => question);;
    }

    shuffleArray(filteredQuestions);
    return filteredQuestions.slice(0, count).map(({ embedding, ...question }) => question);
  }
})

export const recordAnalytics = mutation({
  args: {
    questionId: v.id("questions"),
    event: v.union(
      v.literal("seen"),
      v.literal("liked"),
      v.literal("shared"),
      v.literal("hidden"),
    ),
    viewDuration: v.float64(),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { questionId, event, viewDuration, sessionId } = args;
    const question = await ctx.db.get(questionId);
    if (!question) return;

    const identity = await ctx.auth.getUserIdentity();
    let userId = null;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email))
        .unique();
      if (user) {
        userId = user._id;
      }
    }

    await ctx.db.insert("analytics", {
      questionId,
      event,
      viewDuration,
      timestamp: Date.now(),
      userId: userId ?? undefined,
      sessionId,
    });

    if (event === "liked") {
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
      totalShows: question.totalShows + 1,
      lastShownAt: Date.now(),
    });

    // Update userQuestions if user is logged in
    if (userId) {
      const userQuestion = await ctx.db
        .query("userQuestions")
        .withIndex("by_userIdAndQuestionId", (q) =>
          q.eq("userId", userId!).eq("questionId", questionId)
        )
        .first();

      if (userQuestion) {
        await ctx.db.patch(userQuestion._id, {
          viewDuration: userQuestion.viewDuration ? userQuestion.viewDuration + viewDuration : viewDuration,
          seenCount: userQuestion.seenCount ? userQuestion.seenCount + 1 : 1,
          updatedAt: Date.now(),
          // Preserve "liked" status, or update to "liked" if event is "liked".
          // Otherwise, flip "unseen" -> "seen" on any view event.
          status: (event === "liked" || userQuestion.status === "liked")
            ? "liked"
            : (userQuestion.status === "unseen" ? "seen" : userQuestion.status),
        });
      } else {
        await ctx.db.insert("userQuestions", {
          userId,
          questionId,
          status: event === "liked" ? "liked" : "seen",
          viewDuration,
          seenCount: 1,
          updatedAt: Date.now(),
        });
      }
    }

    return null;
  },
});

export const getQuestionsByIds = query({
  args: {
    ids: v.array(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const { ids } = args;

    // Filter out any invalid IDs before querying
    const validIds = ids.filter(id => {
      try {
        // Basic validation - ensure the ID looks valid
        return typeof id === 'string' && id.length > 0;
      } catch {
        return false;
      }
    });

    if (validIds.length === 0) {
      return [];
    }

    const questions = await Promise.all(
      validIds.map((id) => ctx.db.get(id))
    );
    return questions.filter((q): q is Doc<"questions"> => q !== null);
  },
});

export const getUserLikedAndPreferredEmbedding = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();
    if (!user) {
      return [];
    }
    const likedQuestionIds = await ctx.db
      .query("userQuestions")
      .withIndex("by_userId_status_updatedAt", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();
    const likedQuestions = await Promise.all(
      likedQuestionIds.map((q) => ctx.db.get(q.questionId))
    );
    const embeddings = likedQuestions
      .map((q) => q?.embedding)
      .filter((e) => e !== undefined);
    const results = calculateAverageEmbedding([...embeddings, user.questionPreferenceEmbedding ?? []]);
    return results;
  },
});

export const getCustomQuestions = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();
    if (!userIdentity) {
      return [];
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", userIdentity.email))
      .unique();
    if (!user) {
      return [];
    }
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
      .collect();
    return questions;
  },
});

export const getLikedQuestions = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      return [];
    }

    // Get liked questions from userQuestions table
    const likedUserQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("by_userId_status_updatedAt", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();

    if (likedUserQuestions.length === 0) {
      return [];
    }

    const questions = await Promise.all(
      likedUserQuestions.map((uq) => ctx.db.get(uq.questionId))
    );

    return questions
      .filter((q): q is Doc<"questions"> => q !== null)
      .filter((q) => q.organizationId === args.organizationId);
  },
});

export const getQuestionById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.id) return null;
    try {
      const questionId = ctx.db.normalizeId("questions", args.id);
      if (!questionId) return null;
      return await ctx.db.get(questionId);
    } catch {
      return null;
    }
  },
});

export const getQuestion = query({
  args: {
    id: v.id("questions"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.id);
    if (!question) return null;
    const { embedding, ...questionData } = question;
    return questionData;
  },
});

export const getQuestionForOgImage = query({
  args: {
    id: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.id);
    if (!question) return null;

    let styleDoc = null;
    if (question.style) {
      styleDoc = await ctx.db.query("styles").withIndex("by_my_id", (q) => q.eq("id", question.style!)).unique();
    }

    let toneDoc = null;
    if (question.tone) {
      toneDoc = await ctx.db.query("tones").withIndex("by_my_id", (q) => q.eq("id", question.tone!)).unique();
    }

    return {
      text: question.text || question.customText,
      styleName: styleDoc?.name || "General",
      styleColor: styleDoc?.color || "#000000",
      toneName: toneDoc?.name || "Casual",
      toneColor: toneDoc?.color || "#000000",
      // Infer gradients from colors or use defaults
      gradientStart: styleDoc?.color || "#f0f0f0",
      gradientEnd: toneDoc?.color || "#d0d0d0",
    };
  },
});

// Save the generated AI question to the database
export const saveAIQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.array(v.string()),
    style: v.optional(v.string()),
    styleId: v.id("styles"),
    tone: v.optional(v.string()),
    toneId: v.id("tones"),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { text, tags, style, tone, topic } = args;

    // Check if a question with the same text already exists
    const existingQuestion = await ctx.db
      .query("questions")
      .withIndex("by_text", (q) => q.eq("text", text))
      .first();

    if (existingQuestion) {
      // If a duplicate is found, do not insert a new one.
      // Optionally, you could return the existing question or null
      return null;
    }

    const id = await ctx.db.insert("questions", {
      text,
      tags,
      style,
      styleId: args.styleId,
      tone,
      toneId: args.toneId,
      topic,
      status: "public",
      isAIGenerated: true,
      lastShownAt: 0,
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    await ctx.scheduler.runAfter(0, internal.lib.retriever.embedQuestion, {
      questionId: id,
    });
    return await ctx.db.get(id);
  },
});

async function getOldestQuestion(ctx: QueryCtx) {
  return await ctx.db.query("questions").withIndex("by_last_shown_at").order("asc").take(1);
}

export const getQuestions = query({
  handler: async (ctx) => {
    await ensureAdmin(ctx);
    return await ctx.db.query("questions")
      .withIndex("by_creation_time").order("desc")
      .filter((q) => q.eq(q.field("prunedAt"), undefined))
      .collect();
  },
});

export const createQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { text, tags, style, tone } = args;
    return await ctx.db.insert("questions", {
      text,
      tags,
      style,
      tone,
      isAIGenerated: false,
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  },
});

export const addCustomQuestion = mutation({
  args: {
    customText: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be logged in to add a custom question.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found.");
    }

    const { customText } = args;
    if (customText.trim().length === 0) {
      // do not save empty questions
      return;
    }
    return await ctx.db.insert("questions", {
      authorId: user._id,
      customText,
      status: "pending",
      totalLikes: 0,
      totalThumbsDown: 0,
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
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { id, text, tags, style, tone, status } = args;

    // Build update object with only provided fields
    const updateData: any = { text };

    if (tags !== undefined) {
      updateData.tags = tags;
    }

    if (style !== undefined) {
      updateData.style = style;
    }

    if (tone !== undefined) {
      updateData.tone = tone;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    await ctx.db.patch(id, updateData);
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


// Function to fix existing questions by adding lastShownAt field
export const fixExistingQuestions = mutation({
  handler: async (ctx) => {
    const allQuestions = await ctx.db.query("questions").collect();
    const now = Date.now();
    let fixedCount = 0;

    for (const question of allQuestions) {
      if (question.lastShownAt === undefined) {
        await ctx.db.patch(question._id, {
          lastShownAt: now - Math.random() * 10000000 // Random time in the past
        });
        fixedCount++;
      }
    }

    return { totalQuestions: allQuestions.length, fixedCount };
  },
});

export const getQuestionsToEmbed = internalQuery({
  args: {
    startCreationTime: v.optional(v.number()),
    startQuestionId: v.optional(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_creation_time")
      .order("desc")
      .filter((q) => q.eq(q.field("embedding"), undefined))
      .take(10);
    return questions;
  },
});

export const addEmbedding = internalMutation({
  args: {
    questionId: v.id("questions"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.questionId, {
      embedding: args.embedding,
    });
  },
});

// Function to update multiple question categories at once
export const updateCategories = mutation({
  args: {
    updates: v.array(v.object({
      id: v.id("questions"),
      style: v.optional(v.string()),
      tone: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const update of args.updates) {
      try {
        await ctx.db.patch(update.id, { style: update.style, tone: update.tone });
        results.push({ id: update.id, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ id: update.id, success: false, error: errorMessage });
      }
    }
    return results;
  },
});

// to be executed on a daily schedule
export const cleanDuplicateQuestions = mutation({
  handler: async (ctx) => {
    const allQuestions = await ctx.db.query("questions").collect();

    let totalDeleted = 0;
    //Find duplicate questions by exact text match
    const duplicateQuestions = allQuestions.filter((question, index, self) =>
      index !== self.findIndex((t) => t.text === question.text)
    );
    for (const question of duplicateQuestions) {
      await ctx.db.delete(question._id);
      totalDeleted++;
    }

    return totalDeleted;
  },
});

// Get all questions for duplicate detection (minimal data for efficiency)
export const getAllQuestionsForDuplicateDetection = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("questions"),
    text: v.optional(v.string()),
    style: v.string(),
  })),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    //filter out any questions that are already in a duplicate detection
    const duplicateDetections = await ctx.db.query("duplicateDetections").collect();
    const duplicateQuestionIds = duplicateDetections.flatMap(d => d.questionIds);
    const filteredQuestions = questions.filter(q => !duplicateQuestionIds.includes(q._id));

    // Explicitly create new objects with only the required fields to avoid returning full documents
    const result: Array<{ _id: Id<"questions">, text: string, style: string }> = [];
    for (const q of filteredQuestions) {
      if (q._id && q.text) {
        result.push({
          _id: q._id,
          text: q.text,
          style: q.style ?? "",
        });
      }
    }
    return result;
  },
});

// Save duplicate detection results
export const saveDuplicateDetection = internalMutation({
  args: {
    questionIds: v.array(v.id("questions")),
    reason: v.string(),
    confidence: v.number(),
  },
  returns: v.union(v.id("duplicateDetections"), v.null()),
  handler: async (ctx, args) => {
    // Sort question IDs to ensure consistent ordering for duplicate checking
    const sortedIds = [...args.questionIds].sort();

    // Ideally we would have a unique index on questionIds, but Array indices are tricky in Convex.
    // Instead, we can check if there's any pending/approved detection containing these exact IDs.
    // However, searching for exact array match is also tricky without an index.
    // Since we are detecting duplicates, we can query by one of the IDs and filter.
    // But this mutation might be called many times.

    // Let's assume the caller handles some filtering, but we do a best-effort check here.
    // We'll query duplicateDetections that contain the first question ID.
    // Note: This might be slow if there are many detections for the same question.

    // Check if this pair is already detected (pending, approved, or rejected)
    // We can't easily query "contains exact array", so we fetch potentially relevant ones.
    // Since we sorted IDs, we know order.
    // However, `duplicateDetections` does not have an index on `questionIds`.
    // We will scan all detections? No, that's too slow.

    // Ideally we would add an index on `questionIds`.
    // Since we can't easily modify schema/indexes in this flow without `schema.ts` change,
    // and `schema.ts` edits are tricky (need to match existing), we will do a scan but optimize if possible.

    // Actually, `convex/schema.ts` is available. We could check if we can add index.
    // But for this task, let's just use `filter` which might be slow but safe for now given the volume.
    // Or better: Use `getAllQuestionsForDuplicateDetection` approach - fetch all detections and check in memory?
    // No, mutation shouldn't load everything.

    // Let's check for duplicate detection by querying *one* of the question IDs if we can.
    // We can't query array fields efficiently without an index.
    // But `filter` on array `includes`?
    /*
    const existing = await ctx.db
      .query("duplicateDetections")
      .filter(q =>
         // Check if questionIds array contains BOTH ids.
         // q.field("questionIds") is an array.
         // We can't do logic easily in filter builder.
         true
      )
      .collect();
    */

    // Fallback: Just insert. The action does A < B check so within one run it's unique.
    // Across runs, we might get duplicates.
    // To fix this properly, we need to check existence.
    // Let's load all `duplicateDetections`? If table is small ok.
    // If table is large, this is bad.

    // Better approach:
    // We use uniqueKey index to check for duplicates efficiently.
    const uniqueKey = sortedIds.join("_");
    const existing = await ctx.db
      .query("duplicateDetections")
      .withIndex("by_uniqueKey", (q) => q.eq("uniqueKey", uniqueKey))
      .first();

    if (existing) {
      // Already detected
      return null;
    }

    // Proceed with insert.
    return await ctx.db.insert("duplicateDetections", {
      questionIds: sortedIds,
      uniqueKey,
      reason: args.reason,
      confidence: args.confidence,
      status: "pending",
      detectedAt: Date.now(),
    });
  },
});

// Get all pending duplicate detections for admin review
export const getPendingDuplicateDetections = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("duplicateDetections"),
    _creationTime: v.number(),
    questionIds: v.array(v.id("questions")),
    uniqueKey: v.optional(v.string()),
    reason: v.string(),
    rejectReason: v.optional(v.string()),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("deleted")),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    questions: v.array(v.object({
      _id: v.id("questions"),
      _creationTime: v.number(),
      text: v.string(),
      style: v.object({
        _id: v.id("styles"),
        icon: v.string(),
        name: v.string(),
        color: v.string(),
      }),
      tone: v.object({
        _id: v.id("tones"),
        icon: v.string(),
        name: v.string(),
        color: v.string(),
      }),
      totalLikes: v.number(),
      totalShows: v.number(),
    })),
  })),
  handler: async (ctx): Promise<any> => {
    await ensureAdmin(ctx);

    const detections = await ctx.db
      .query("duplicateDetections")
      .withIndex("by_status_and_confidence", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    const detectionsWithQuestions = await Promise.all(
      detections.map(async (detection) => {
        const questions = await Promise.all(
          detection.questionIds.map(async (id) => {
            const question = await ctx.db.get(id);
            if (!question) return null;
            if (!question.styleId || !question.toneId) return null;

            const [styleRaw, toneRaw] = await Promise.all([
              ctx.db.get(question.styleId),
              ctx.db.get(question.toneId),
            ]);

            if (!styleRaw || !toneRaw) return null;

            return {
              _id: question._id,
              _creationTime: question._creationTime,
              text: question.text,
              style: {
                _id: styleRaw._id,
                icon: styleRaw.icon,
                name: styleRaw.name,
                color: styleRaw.color,
              },
              tone: {
                _id: toneRaw._id,
                icon: toneRaw.icon,
                name: toneRaw.name,
                color: toneRaw.color,
              },
              totalLikes: question.totalLikes,
              totalShows: question.totalShows,
            };
          })
        );

        const validQuestions = questions.filter((q): q is NonNullable<typeof q> => q !== null);

        // Only return detections where we have at least 2 questions still existing
        if (validQuestions.length < 2) return null;

        return {
          ...detection,
          questions: validQuestions,
        };
      })
    );

    return detectionsWithQuestions.filter((d): d is NonNullable<typeof d> => d !== null);
  },
});

// Get all completed duplicate detections for admin review
export const getCompletedDuplicateDetections = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("duplicateDetections"),
    _creationTime: v.number(),
    questionIds: v.array(v.id("questions")),
    uniqueKey: v.optional(v.string()),
    reason: v.string(),
    rejectReason: v.optional(v.string()),
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("deleted")),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    questions: v.array(v.object({
      _id: v.id("questions"),
      _creationTime: v.number(),
      text: v.string(),
      style: v.union(v.null(), v.object({
        _id: v.id("styles"),
        icon: v.string(),
        name: v.string(),
        color: v.string(),
      })),
      tone: v.union(v.null(), v.object({
        _id: v.id("tones"),
        icon: v.string(),
        name: v.string(),
        color: v.string(),
      })),
      totalLikes: v.number(),
      totalShows: v.number(),
    })),
  })),
  handler: async (ctx): Promise<any> => {
    await ensureAdmin(ctx);

    const approvedDetections = await ctx.db
      .query("duplicateDetections")
      .withIndex("by_status_and_confidence", (q) => q.eq("status", "approved"))
      .order("desc")
      .collect();

    const rejectedDetections = await ctx.db
      .query("duplicateDetections")
      .withIndex("by_status_and_confidence", (q) => q.eq("status", "rejected"))
      .order("desc")
      .collect();

    const detections = [...approvedDetections, ...rejectedDetections].sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));

    const detectionsWithDetails = await Promise.all(
      detections.map(async (detection) => {
        const questions = await Promise.all(
          detection.questionIds.map(async (id) => {
            const question = await ctx.db.get(id);
            if (!question) return null;

            // For completed ones, style/tone might be missing if they were deleted, so we should be extra careful
            let style = null;
            let tone = null;

            if (question.styleId) {
              const styleRaw = await ctx.db.get(question.styleId);
              if (styleRaw) {
                style = {
                  _id: styleRaw._id,
                  icon: styleRaw.icon,
                  name: styleRaw.name,
                  color: styleRaw.color,
                };
              }
            }

            if (question.toneId) {
              const toneRaw = await ctx.db.get(question.toneId);
              if (toneRaw) {
                tone = {
                  _id: toneRaw._id,
                  icon: toneRaw.icon,
                  name: toneRaw.name,
                  color: toneRaw.color,
                };
              }
            }

            return {
              _id: question._id,
              _creationTime: question._creationTime,
              text: question.text,
              style,
              tone,
              totalLikes: question.totalLikes,
              totalShows: question.totalShows,
            };
          })
        );
        return {
          ...detection,
          questions: questions.filter((q): q is NonNullable<typeof q> => q !== null),
        };
      })
    );

    return detectionsWithDetails;
  },
});

// Update duplicate detection status (approve/reject)
export const updateDuplicateDetectionStatus = mutation({
  args: {
    detectionId: v.id("duplicateDetections"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    reviewerEmail: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);

    const reviewerId = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.reviewerEmail)).unique();
    await ctx.db.patch(args.detectionId, {
      status: args.status,
      reviewedAt: Date.now(),
      reviewedBy: reviewerId?._id ?? "system" as Id<"users">,
      rejectReason: args.rejectReason,
    });

    return null;
  },
});

// Delete duplicate questions after approval
export const deleteDuplicateQuestions = mutation({
  args: {
    detectionId: v.id("duplicateDetections"),
    questionIdsToDelete: v.array(v.id("questions")),
    keepQuestionId: v.optional(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);

    // Delete the specified questions
    for (const questionId of args.questionIdsToDelete) {
      if (args.keepQuestionId && questionId === args.keepQuestionId) {
        continue;
      }
      await ctx.db.delete(questionId);
    }

    // Update the detection status
    await ctx.db.patch(args.detectionId, {
      status: "approved",
      reviewedAt: Date.now(),
    });

    return null;
  },
});


// Internal query to get question counts by style and tone combination
export const getQuestionCountsByStyleAndTone = internalQuery({
  args: {},
  returns: v.array(v.object({
    style: v.string(),
    tone: v.string(),
    count: v.number(),
  })),
  handler: async (ctx) => {
    // Get all questions with style and tone
    const questions = await ctx.db
      .query("questions")
      .filter((q) => q.and(
        q.neq(q.field("style"), undefined),
        q.neq(q.field("tone"), undefined)
      ))
      .collect();

    // Count by style and tone combination
    const counts = new Map<string, number>();

    for (const question of questions) {
      if (question.style && question.tone) {
        const key = `${question.style}|${question.tone}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    // Convert to array format
    return Array.from(counts.entries()).map(([key, count]) => {
      const [style, tone] = key.split('|');
      return { style, tone, count };
    });
  },
});

// Public query to get question counts by style and tone combination (for monitoring)
export const getQuestionCountsByStyleAndTonePublic = query({
  args: {},
  returns: v.array(v.object({
    style: v.string(),
    tone: v.string(),
    count: v.number(),
  })),
  handler: async (ctx) => {
    await ensureAdmin(ctx);

    // Get all questions with style and tone
    const questions = await ctx.db
      .query("questions")
      .filter((q) => q.and(
        q.neq(q.field("style"), undefined),
        q.neq(q.field("tone"), undefined)
      ))
      .collect();

    // Count by style and tone combination
    const counts = new Map<string, number>();

    for (const question of questions) {
      if (question.style && question.tone) {
        const key = `${question.style}|${question.tone}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    // Convert to array format
    return Array.from(counts.entries()).map(([key, count]) => {
      const [style, tone] = key.split('|');
      return { style, tone, count };
    });
  },
});


export const getQuestionsWithMissingEmbeddings = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("questions"),
    text: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").filter((q) => q.and(
      q.neq(q.field("text"), undefined),
      q.eq(q.field("embedding"), undefined)
    )).collect();

    const result = [];
    for (const q of questions) {
      result.push({
        _id: q._id,
        text: q.text,
      });
    }
    return result;
  }
});

export const getQuestionEmbedding = internalQuery({
  args: {
    questionId: v.id("questions"),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.query("questions").withIndex("by_id", (q) => q.eq("_id", args.questionId)).first();
    if (!question) {
      return [];
    }
    return question.embedding;
  },
});

export const getNearestQuestionsByEmbedding = action({
  args: {
    embedding: v.array(v.number()),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { embedding, style, tone, count } = args;
    if (!embedding || embedding.length === 0) {
      return [];
    }
    const requestedCount = count ?? 10;
    const limit = requestedCount * 10; // Fetch more candidates for post-filtering

    // Use simple vector search without complex filters
    // We rely on post-filtering for strict style/tone/status matching
    const results = await ctx.vectorSearch("questions", "by_embedding", {
      vector: embedding,
      limit,
    });

    const ids = results.map((r) => r._id);
    if (ids.length === 0) return [];

    const questions = (await ctx.runQuery(api.questions.getQuestionsByIds, { ids })) as any[];

    // Apply strict filtering
    const filtered = questions.filter((q) => {
      // Basic validity
      if (q.prunedAt !== undefined) return false;
      if (q.text === undefined) return false;
      if (q.status !== "approved" && q.status !== undefined) return false;

      // Style/Tone filtering
      if (style && q.style !== style) return false;
      if (tone && q.tone !== tone) return false;

      return true;
    });

    // Return only the requested count
    return filtered.slice(0, requestedCount);
  },
});

export const getNextQuestionsByEmbedding = action({
  args: {
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    count: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { style, tone, count, userId } = args;
    if (!userId) {
      return [];
    }
    const user: Doc<"users"> | null = await ctx.runQuery(internal.users.getUser, {
      userId: userId,
    });
    if (!user) {
      return [];
    }
    const embedding = await embed(style + " " + tone);
    if (!embedding) {
      return [];
    }
    const averageEmbedding = calculateAverageEmbedding([embedding, user.questionPreferenceEmbedding ?? []] as number[][]);
    const results: Array<Doc<"questions">> = await ctx.runAction(api.questions.getNearestQuestionsByEmbedding, {
      embedding: averageEmbedding,
      count: count,
    });

    return results;
  },
});
export const getQuestionsWithEmbeddingsBatch = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { cursor, limit } = args;
    const paginationResult = await ctx.db
      .query("questions")
      .filter((q) => q.neq(q.field("embedding"), undefined))
      .paginate({ cursor, numItems: limit });

    // Explicitly create new objects with only the required fields to avoid returning full documents
    // But we need embeddings for vector search
    // Since this is internalQuery called from action, we can return full objects or subsets.
    // Let's return only what we need: _id, text, embedding.

    // Actually, vectorSearch needs the vector.
    // Note: returning embedding array might be large.
    // But we need it in the action to perform search.

    return {
      questions: paginationResult.page.map(q => ({
        _id: q._id,
        text: q.text,
        embedding: q.embedding,
      })),
      continueCursor: paginationResult.continueCursor,
      isDone: paginationResult.isDone,
    };
  },
});

export const countQuestions = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // TODO: This is not scalable for very large datasets.
    // Consider using an aggregate table or approximate count if this becomes a bottleneck.
    return (await ctx.db.query("questions").collect()).length;
  },
});

export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    await ensureAdmin(ctx);

    const questions = await ctx.db.query("questions").collect();
    const users = await ctx.db.query("users").collect();
    const feedback = await ctx.db.query("feedback").collect();
    const duplicates = await ctx.db.query("duplicateDetections").filter(q => q.eq(q.field("status"), "pending")).collect();

    // Simple stale count (mock logic similar to what prune looks for)
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const staleCount = questions.filter(q =>
      (q.lastShownAt ?? 0) < oneWeekAgo &&
      q.totalLikes === 0 &&
      q.totalShows > 0 &&
      q.prunedAt === undefined
    ).length;

    return {
      questions: {
        total: questions.length,
        public: questions.filter(q => q.status === "public" || !q.status).length,
        pending: questions.filter(q => q.status === "pending").length,
        pruned: questions.filter(q => q.prunedAt !== undefined).length,
      },
      users: {
        total: users.length,
        admins: users.filter(u => u.isAdmin).length,
        casual: users.filter(u => u.subscriptionTier === "casual").length,
      },
      feedback: {
        total: feedback.length,
        new: feedback.filter(f => f.status === "new").length,
      },
      duplicates: {
        pending: duplicates.length,
      },
      staleCount,
    };
  },
});

// Helper: Check if exact question text already exists
export const checkExactDuplicate = internalQuery({
  args: {
    text: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("questions")
      .withIndex("by_text", (q) => q.eq("text", args.text))
      .first();
    return existing !== null;
  },
});

// Helper: Save a pool question with proper metadata
export const savePoolQuestion = internalMutation({
  args: {
    text: v.string(),
    styleId: v.id("styles"),
    style: v.string(),
    toneId: v.id("tones"),
    tone: v.string(),
    poolDate: v.string(),
  },
  returns: v.union(v.id("questions"), v.null()),
  handler: async (ctx, args) => {
    // Double-check for duplicate (race condition protection)
    const existing = await ctx.db
      .query("questions")
      .withIndex("by_text", (q) => q.eq("text", args.text))
      .first();

    if (existing) {
      return null;
    }

    return await ctx.db.insert("questions", {
      text: args.text,
      styleId: args.styleId,
      style: args.style,
      toneId: args.toneId,
      tone: args.tone,
      poolDate: args.poolDate,
      poolStatus: "available",
      status: "public",
      isAIGenerated: true,
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
      lastShownAt: 0,
    });
  },
});

// Get available pool questions for a specific date
export const getAvailablePoolQuestions = internalQuery({
  args: {
    poolDate: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("questions")
      .withIndex("by_poolDate_and_poolStatus", (q) =>
        q.eq("poolDate", args.poolDate).eq("poolStatus", "available")
      )
      .take(limit);
  },
});

// Mark pool questions as distributed
export const markPoolQuestionsDistributed = internalMutation({
  args: {
    questionIds: v.array(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.questionIds) {
      await ctx.db.patch(id, { poolStatus: "distributed" });
    }
    return null;
  },
});

// Assign pool questions to a single user as unseen
export const assignPoolQuestionsToUser = internalMutation({
  args: {
    userId: v.id("users"),
    questionIds: v.array(v.id("questions")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId, questionIds } = args;
    let assigned = 0;

    for (const questionId of questionIds) {
      // Check if user already has this question
      const existing = await ctx.db
        .query("userQuestions")
        .withIndex("by_userIdAndQuestionId", (q) =>
          q.eq("userId", userId).eq("questionId", questionId)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("userQuestions", {
          userId,
          questionId,
          status: "unseen",
          updatedAt: Date.now(),
        });
        assigned++;
      }
    }

    return assigned;
  },
});

// Internal action: Assign pool questions to all newsletter subscribers
export const assignPoolQuestionsToUsers = internalAction({
  args: {
    questionsPerUser: v.number(),
  },
  returns: v.object({
    usersProcessed: v.number(),
    totalAssigned: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { questionsPerUser } = args;
    const today = new Date().toISOString().split('T')[0];

    let usersProcessed = 0;
    let totalAssigned = 0;
    const errors: string[] = [];

    // Get available pool questions for today
    const poolQuestions: Doc<"questions">[] = await ctx.runQuery(
      internal.questions.getAvailablePoolQuestions,
      { poolDate: today, limit: 200 }
    );

    if (poolQuestions.length === 0) {
      console.log("No pool questions available for today");
      return { usersProcessed: 0, totalAssigned: 0, errors: ["No pool questions available"] };
    }

    // Get all users with newsletter subscription
    const subscribers: Doc<"users">[] = await ctx.runQuery(
      internal.users.getNewsletterSubscribers
    );

    // Bulk fetch hidden preferences for all subscribers (2 queries instead of 2N)
    const userIds = subscribers.map(s => s._id);
    const { hiddenStyles: allHiddenStyles, hiddenTones: allHiddenTones } = await ctx.runQuery(
      internal.users.getHiddenPreferencesForUsers,
      { userIds }
    );

    // Build lookup maps by user ID
    const hiddenStylesByUser = new Map<string, Set<string>>();
    const hiddenTonesByUser = new Map<string, Set<string>>();

    for (const hs of allHiddenStyles) {
      const userId = hs.userId.toString();
      if (!hiddenStylesByUser.has(userId)) {
        hiddenStylesByUser.set(userId, new Set());
      }
      hiddenStylesByUser.get(userId)!.add(hs.styleId.toString());
    }

    for (const ht of allHiddenTones) {
      const userId = ht.userId.toString();
      if (!hiddenTonesByUser.has(userId)) {
        hiddenTonesByUser.set(userId, new Set());
      }
      hiddenTonesByUser.get(userId)!.add(ht.toneId.toString());
    }

    // Track actually assigned question IDs
    const assignedQuestionIds = new Set<Id<"questions">>();

    for (const user of subscribers) {
      try {
        usersProcessed++;

        // Look up user's hidden styles and tones from the pre-fetched maps
        const hiddenStyleIds = hiddenStylesByUser.get(user._id.toString()) ?? new Set();
        const hiddenToneIds = hiddenTonesByUser.get(user._id.toString()) ?? new Set();

        // Filter pool questions by user preferences
        let userQuestions = poolQuestions.filter(q => {
          if (q.styleId && hiddenStyleIds.has(q.styleId.toString())) return false;
          if (q.toneId && hiddenToneIds.has(q.toneId.toString())) return false;
          return true;
        });

        // If user has preference embedding, sort by similarity
        if (user.questionPreferenceEmbedding && user.questionPreferenceEmbedding.length > 0) {
          // Simple cosine similarity sorting (approximate, for performance)
          userQuestions.sort((a, b) => {
            if (!a.embedding || !b.embedding) return 0;
            const simA = cosineSimilarity(user.questionPreferenceEmbedding!, a.embedding);
            const simB = cosineSimilarity(user.questionPreferenceEmbedding!, b.embedding);
            return simB - simA; // Descending
          });
        } else {
          // Shuffle for randomness
          for (let i = userQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [userQuestions[i], userQuestions[j]] = [userQuestions[j], userQuestions[i]];
          }
        }

        // Take top N questions
        const toAssign = userQuestions.slice(0, questionsPerUser);
        const questionIds = toAssign.map(q => q._id);

        if (questionIds.length > 0) {
          const assigned: number = await ctx.runMutation(
            internal.questions.assignPoolQuestionsToUser,
            { userId: user._id, questionIds }
          );
          totalAssigned += assigned;

          // Track which questions were actually assigned
          for (const qid of questionIds) {
            assignedQuestionIds.add(qid);
          }
        }

      } catch (error: any) {
        errors.push(`Error assigning to user ${user._id}: ${error.message}`);
      }
    }

    // Mark assigned questions as distributed (using actually assigned IDs)
    if (assignedQuestionIds.size > 0) {
      const _: null = await ctx.runMutation(internal.questions.markPoolQuestionsDistributed, {
        questionIds: Array.from(assignedQuestionIds),
      });
    }

    // Send summary email
    if (usersProcessed > 0) {
      const subject = `📬 Pool Questions Assigned: ${totalAssigned} to ${usersProcessed} users`;
      const html = `
        <h2>Pool Question Assignment Summary</h2>
        <p><strong>Date:</strong> ${today}</p>
        <p><strong>Users Processed:</strong> ${usersProcessed}</p>
        <p><strong>Total Questions Assigned:</strong> ${totalAssigned}</p>
        <p><strong>Questions Per User Target:</strong> ${questionsPerUser}</p>
        ${errors.length > 0 ? `<h3>Errors (${errors.length})</h3><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
      `;
      await ctx.runAction(internal.email.sendEmail, { subject, html });
    }

    return { usersProcessed, totalAssigned, errors };
  },
});

// Helper: Simple cosine similarity for preference matching
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
