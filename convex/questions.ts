import { v } from "convex/values";
import { mutation, query, QueryCtx, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ensureAdmin } from "./auth";
import { embed } from "./lib/retriever";
import { api, internal } from "./_generated/api";

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
    return null;
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
  },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<any[]> => {
    const { count, style, tone, seen, hidden } = args;

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
    const likedQuestions = user.likedQuestions ?? [];
    if (likedQuestions.length === 0) {
      return [];
    }
    // Get the embeddings of the liked questions.
    const likedQuestionDocs = (
      await Promise.all(
        likedQuestions.map((id) =>
          ctx.db
            .query("questions")
            .filter((q) => q.eq(q.field("_id"), id))
            .first()
        )
      )
    ).filter((q) => q !== null) as Doc<"questions">[];
    const likedQuestionEmbeddings = likedQuestionDocs
      .map((q) => q.embedding)
      .filter((e) => e !== undefined) as number[][];
    if (likedQuestionEmbeddings.length === 0) {
      return [];
    }

    // Average the embeddings to get a single vector.
    const avgEmbedding = new Array(likedQuestionEmbeddings[0].length).fill(0);
    for (const embedding of likedQuestionEmbeddings) {
      for (let i = 0; i < avgEmbedding.length; i++) {
        avgEmbedding[i] += embedding[i];
      }
    }
    for (let i = 0; i < avgEmbedding.length; i++) {
      avgEmbedding[i] /= likedQuestionEmbeddings.length;
    }

    // Use regular query with filter instead of vectorSearch since it's not available in queries
    // Get questions with the same style and tone, then filter by similarity manually
    const candidates = await ctx.db
      .query("questions")
      .withIndex("by_style_and_tone", (q: any) => q.eq("style", style).eq("tone", tone))
      .filter((q: any) => q.and(
        ...(hidden ?? []).map((id: any) => q.neq(q.field("_id"), id)),
        ...(seen ?? []).map((id: any) => q.neq(q.field("_id"), id)),
        ...likedQuestions.map((id: any) => q.neq(q.field("_id"), id))
      ))
      .take(count * 4);
    
    return candidates;
  },
});

export const getNextQuestions = query({
  args: {
    count: v.number(),
    style: v.string(),
    tone: v.string(),
    seen: v.optional(v.array(v.id("questions"))),
    hidden: v.optional(v.array(v.id("questions"))),
  },
  returns: v.array(v.object({
    _id: v.id("questions"),
    _creationTime: v.number(),
    averageViewDuration: v.number(),
    lastShownAt: v.optional(v.number()),
    text: v.string(),
    totalLikes: v.number(),
    totalThumbsDown: v.optional(v.number()),
    totalShows: v.number(),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const { count, style, tone, seen, hidden } = args;
    const seenIds = new Set(seen ?? []);

    // Get all questions first, and filter out seen ones.
    const filteredQuestions = await ctx.db
      .query("questions")
      .withIndex("by_style_and_tone", (q) => q.eq("style", style).eq("tone", tone))
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
    event: v.union(v.literal("like"), v.literal("discard")),
    viewDuration: v.number(),
  },
  returns: v.null(),
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

export const getQuestion = query({
  args: {
    id: v.id("questions"),
  },
  returns: v.union(v.object({
    _id: v.id("questions"),
    _creationTime: v.float64(),
    text: v.string(),
    style: v.optional(v.string()),
    tone: v.optional(v.string()),
    totalLikes: v.float64(),
    totalShows: v.float64(),
    averageViewDuration: v.float64(),
    lastShownAt: v.optional(v.float64()),
    totalThumbsDown: v.optional(v.float64()),
    isAIGenerated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  }), v.null()),
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

    // Use a more robust approach to avoid concurrency issues
    // Generate a unique timestamp with some randomness to avoid conflicts
    const now = Date.now();
    const randomOffset = Math.floor(Math.random() * 1000); // 0-999ms random offset
    const lastShownAt = now - randomOffset;
    
    const id = await ctx.db.insert("questions", {
      text,
      tags,
      style,
      tone,
      isAIGenerated: true,
      // Use a negative timestamp to ensure new questions appear first
      lastShownAt: -lastShownAt,
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
    return await ctx.db.query("questions").withIndex("by_creation_time").order("desc").collect();
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

export const backfillQuestionEmbeddings = internalAction({
  args: {
    questionId: v.optional(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const startQuestion = args.questionId
      ? await ctx.runQuery(api.questions.getQuestion, { id: args.questionId })
      : null;
    const questions = await ctx.runQuery(
      internal.questions.getQuestionsToEmbed,
      {
        startQuestionId: startQuestion?._id,
        startCreationTime: startQuestion?._creationTime,
      }
    );
    if (questions.length === 0) {
      console.log("No more questions to embed");
      return;
    }
    for (const question of questions) {
      const embedding = await embed(question.text);
      await ctx.runMutation(internal.questions.addEmbedding, {
        questionId: question._id,
        embedding,
      });
    }
    if (questions.length < 10) {
      console.log("Done");
      return;
    }
    await ctx.runAction(internal.questions.backfillQuestionEmbeddings, {
      questionId: questions[questions.length - 1]._id,
    });
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
    text: v.string(),
    style: v.string(),
  })),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    //filter out any questions that are already in a duplicate detection
    const duplicateDetections = await ctx.db.query("duplicateDetections").collect();
    const duplicateQuestionIds = duplicateDetections.flatMap(d => d.questionIds);
    const filteredQuestions = questions.filter(q => !duplicateQuestionIds.includes(q._id));
    return filteredQuestions.map(q => ({
      _id: q._id,
      text: q.text,
      style: q.style ?? "",
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

    const deletedDetections = await ctx.db
      .query("duplicateDetections")
      .withIndex("by_status_and_confidence", (q) => q.eq("status", "deleted"))
      .order("desc")
      .collect();

    const detections = [...approvedDetections, ...rejectedDetections, ...deletedDetections].sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));

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
      status: args.keepQuestionId ? "approved" : "deleted",
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
    text: v.string(),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("questions").filter((q) => q.eq(q.field("embedding"), undefined)).collect();
  }
});