import { v } from "convex/values";
import { mutation, query, QueryCtx, internalQuery, internalMutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { ensureAdmin } from "./auth";

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
        totalThumbsDown: (question.totalThumbsDown ?? 0) + 1,
        lastShownAt: Date.now(),
      });

      await Promise.all([analytics, updateQuestion]);
    }
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
export const getNextQuestions = query({
  args: {
    count: v.number(),
    style: v.string(),
    tone: v.string(),
    seen: v.optional(v.array(v.id("questions"))),
  },
  handler: async (ctx, args) => {
    const { count, style, tone, seen } = args;
    const seenIds = new Set(seen ?? []);

    // Get all questions first, and filter out seen ones.
    const filteredQuestions = await ctx.db
      .query("questions")
      .withIndex("by_style_and_tone", (q) => q.eq("style", style).eq("tone", tone))
      .collect();

    const unseenQuestions = filteredQuestions.filter(q => !seenIds.has(q._id));
    if (unseenQuestions.length > 0) {
      shuffleArray(unseenQuestions);
      return unseenQuestions.slice(0, count);
    }

    shuffleArray(filteredQuestions);
    return filteredQuestions.slice(0, count);
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

export const getLikedQuestions = query({
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

    if (!user || !user.likedQuestions) {
      return [];
    }

    const questions = await Promise.all(
      user.likedQuestions.map((id) => ctx.db.get(id))
    );

    return questions.filter((q): q is Doc<"questions"> => q !== null);
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
    const oldestQuestion = await getOldestQuestion(ctx);
    const lastShownAt = oldestQuestion ? oldestQuestion[0]?.lastShownAt ?? 0 : 0;
    const id = await ctx.db.insert("questions", {
      text,
      tags,
      style,
      tone,
      isAIGenerated: true,
      // Seed lastShownAt with a small negative value so it is included
      // at the front of the by_last_shown_at ascending index and shows up immediately.
      lastShownAt: lastShownAt - 1,
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
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
    return await ctx.db.query("questions").collect();
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

export const updateQuestion = mutation({
  args: {
    id: v.id("questions"),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const { id, text, tags, style, tone } = args;
    await ctx.db.patch(id, { text, tags, style, tone });
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
    text: v.string(),
  })),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    return questions.map(q => ({
      _id: q._id,
      text: q.text,
    }));
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
    confidence: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
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

// Update duplicate detection status (approve/reject)
export const updateDuplicateDetectionStatus = mutation({
  args: {
    detectionId: v.id("duplicateDetections"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    reviewerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    
    await ctx.db.patch(args.detectionId, {
      status: args.status,
      reviewedAt: Date.now(),
      reviewedBy: args.reviewerId,
    });
    
    return null;
  },
});

// Delete duplicate questions after approval
export const deleteDuplicateQuestions = mutation({
  args: {
    detectionId: v.id("duplicateDetections"),
    questionIdsToDelete: v.array(v.id("questions")),
    keepQuestionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    
    // Delete the specified questions
    for (const questionId of args.questionIdsToDelete) {
      if (questionId !== args.keepQuestionId) {
        await ctx.db.delete(questionId);
      }
    }
    
    // Update the detection status
    await ctx.db.patch(args.detectionId, {
      status: "approved",
      reviewedAt: Date.now(),
    });
    
    return null;
  },
});

// Legacy function - now calls the AI action
export const detectDuplicateQuestions = mutation({
  args: {},
  returns: v.null(),
  handler: async (_ctx) => {
    // This is now handled by the scheduled action
    // Keeping this for backward compatibility but it does nothing
    return null;
  },
});
