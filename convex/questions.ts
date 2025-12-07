import { v } from "convex/values";
import { mutation, query, QueryCtx, internalQuery, internalMutation, internalAction, action } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ensureAdmin } from "./auth";
import { embed } from "./lib/retriever";
import { api, internal } from "./_generated/api";
import { createPrunedStaleQuestionsEmail } from "./lib/emails";

export const calculateAverageEmbedding = (embeddings: number[][]) => {
  if (embeddings.length === 0) {
    return [];
  }
  if (embeddings[0].length === 0) {
    return [];
  }
  const averageEmbedding = embeddings.reduce((acc, embedding) => {
    return acc.map((value, index) => value + embedding[index]);
  }, Array(embeddings[0].length).fill(0));
  return averageEmbedding.map((value) => value / embeddings.length);
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
      status: "personal",
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
const shuffleArray = (array: any[]) => {
  const random = mulberry32(Date.now());
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export const getSimilarQuestions = query({
  args: {
    count: v.number(),
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
      .withIndex("by_userIdAndStatus", (q) =>
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
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), undefined)),
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
    count: v.number(),
    seen: v.optional(v.array(v.id("questions"))),
    hidden: v.optional(v.array(v.id("questions"))),
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { count, seen, hidden, organizationId } = args;
    const seenIds = new Set(seen ?? []);

    // Get all questions first, and filter out seen ones.
    const filteredQuestions = await ctx.db
      .query("questions")
      .filter((q: any) => q.eq(q.field("organizationId"), organizationId))
      .filter((q: any) => q.eq(q.field("prunedAt"), undefined))
      .filter((q: any) => q.and(
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), undefined)),
        ...(hidden ?? []).map((id: any) => q.neq(q.field("_id"), id)),
        ...(seen ?? []).map((id: any) => q.neq(q.field("_id"), id))
      ))
      .take(count * 4);

    shuffleArray(filteredQuestions);
    return filteredQuestions.slice(0, count);
  },
});

export const getNextQuestions = query({
  args: {
    count: v.number(),
    style: v.string(),
    tone: v.string(),
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
      .withIndex("by_style_and_tone", (q) => q.eq("style", style).eq("tone", tone))
      .filter((q) => q.eq(q.field("organizationId"), organizationId))
      .filter((q) => q.eq(q.field("prunedAt"), undefined))
      .filter((q) => q.and(
        q.neq(q.field("text"), undefined),
        q.or(q.eq(q.field("status"), "approved"), q.eq(q.field("status"), undefined))
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
    viewDuration: v.number(),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { questionId, event, viewDuration, sessionId } = args;
    const question = await ctx.db.get(questionId);
    if (!question) return;

    const identity = await ctx.auth.getUserIdentity();
    console.log("identity", identity);
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
        .unique();

      if (userQuestion) {
        await ctx.db.patch(userQuestion._id, {
          viewDuration: userQuestion.viewDuration ? userQuestion.viewDuration + viewDuration : viewDuration,
          seenCount: userQuestion.seenCount ? userQuestion.seenCount + 1 : 1,
          updatedAt: Date.now(),
          // Don't overwrite "liked" status with "seen"
          status: userQuestion.status === "liked" ? "liked" : (event === "liked" ? "liked" : userQuestion.status),
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
      .withIndex("by_userIdAndStatus", (q) =>
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
      .withIndex("by_userIdAndStatus", (q) =>
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

// Save the generated AI question to the database
export const saveAIQuestion = mutation({
  args: {
    text: v.string(),
    tags: v.array(v.string()),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { text, tags, style, tone } = args;

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
      tone,
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
  returns: v.id("duplicateDetections"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("duplicateDetections", {
      questionIds: args.questionIds,
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
      style: v.optional(v.string()),
      tone: v.optional(v.string()),
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
            return {
              _id: question._id,
              _creationTime: question._creationTime,
              text: question.text,
              style: question.style,
              tone: question.tone,
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

    return detectionsWithQuestions;
  },
});

// Get all completed duplicate detections for admin review
export const getCompletedDuplicateDetections = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("duplicateDetections"),
    _creationTime: v.number(),
    questionIds: v.array(v.id("questions")),
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
      style: v.optional(v.string()),
      tone: v.optional(v.string()),
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
            return {
              _id: question._id,
              _creationTime: question._creationTime,
              text: question.text,
              style: question.style,
              tone: question.tone,
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
      status: args.keepQuestionId ? "rejected" : "approved",
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