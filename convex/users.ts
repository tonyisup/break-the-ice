import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper to ensure user exists
async function getUserOrCreate(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", identity.email))
    .unique();

  if (user) {
    return user;
  }

  const userId = await ctx.db.insert("users", {
    name: identity.name!,
    email: identity.email,
    image: identity.pictureUrl,
  });

  return (await ctx.db.get(userId))!;
}

export const getCurrentUser = query({
  args: {},
  returns: v.union(v.null(), v.any()),
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    return user;
  },
});

export const updateUserFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.string(),
    image: v.optional(v.string()),
    subscriptionTier: v.union(v.literal("free"), v.literal("casual")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, {
        name: args.name,
        image: args.image,
        subscriptionTier: args.subscriptionTier,
      });
    } else if (args.email) {
      await ctx.db.insert("users", {
        name: args.name,
        email: args.email,
        image: args.image,
        subscriptionTier: args.subscriptionTier,
        aiUsage: { count: 0, cycleStart: Date.now() },
      });
    }
  },
});

export const checkAndIncrementAIUsage = internalMutation({
  args: {
    userId: v.id("users"),
    count: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const cycleLength = 30 * 24 * 60 * 60 * 1000; // 30 days
    let aiUsage = user.aiUsage || { count: 0, cycleStart: now };

    // Reset cycle if needed
    if (now - aiUsage.cycleStart > cycleLength) {
      aiUsage = { count: 0, cycleStart: now };
    }

    const limit = user.subscriptionTier === "casual" ? 100 : 10;

    if (aiUsage.count + args.count > limit) {
      throw new Error(`AI generation limit reached. You have used ${aiUsage.count}/${limit} generations this cycle.`);
    }

    await ctx.db.patch(user._id, {
      aiUsage: {
        count: aiUsage.count + args.count,
        cycleStart: aiUsage.cycleStart,
      },
    });

    return true;
  },
});

export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    // Check if we've already stored this identity before.
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (user !== null) {
      // If we've seen this identity before but the name has changed, patch the value.
      if (user.name !== identity.name) {
        await ctx.db.patch(user._id, { name: identity.name });
      }
      return user._id;
    }

    // If it's a new identity, create a new user.
    return await ctx.db.insert("users", {
      name: identity.name!,
      email: identity.email,
      image: identity.pictureUrl,
    });
  },
});

export const getSettings = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      likedQuestions: v.optional(v.array(v.id("questions"))),
      hiddenQuestions: v.optional(v.array(v.id("questions"))),
      hiddenStyles: v.optional(v.array(v.string())),
      hiddenTones: v.optional(v.array(v.string())),
      defaultStyle: v.optional(v.string()),
      defaultTone: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      return null;
    }

    // Get liked questions from userQuestions table
    const likedUserQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("by_userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();
    const likedQuestions = likedUserQuestions.map((uq) => uq.questionId);

    // Get hidden questions from userQuestions table
    const hiddenUserQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("by_userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "hidden")
      )
      .collect();
    const hiddenQuestions = hiddenUserQuestions.map((uq) => uq.questionId);

    // Get hidden styles from userHiddenStyles table
    const hiddenStylesDocs = await ctx.db
      .query("userStyles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const hiddenStyles = hiddenStylesDocs.map((us) => us.styleId);

    // Get hidden tones from userHiddenTones table
    const hiddenTonesDocs = await ctx.db
      .query("userTones")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const hiddenTones = hiddenTonesDocs.map((ut) => ut.toneId);

    return {
      likedQuestions: likedQuestions.length > 0 ? likedQuestions : undefined,
      hiddenQuestions: hiddenQuestions.length > 0 ? hiddenQuestions : undefined,
      hiddenStyles: hiddenStyles.length > 0 ? hiddenStyles : undefined,
      hiddenTones: hiddenTones.length > 0 ? hiddenTones : undefined,
      defaultStyle: user.defaultStyle,
      defaultTone: user.defaultTone,
    };
  },
});

export const getQuestionHistory = query({
  args: {
    limit: v.optional(v.number()),
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

    const limit = args.limit ?? 50;
    // Enforce free tier limit
    const effectiveLimit = user.subscriptionTier === "casual" ? limit : Math.min(limit, 100);

    const history = await ctx.db
      .query("analytics")
      .withIndex("by_userId_event_timestamp", (q) =>
        q.eq("userId", user._id).eq("event", "seen")
      )
      .order("desc")
      .take(effectiveLimit);

    const questions = await Promise.all(
      history.map(async (h) => {
        const question = await ctx.db.get(h.questionId);
        if (!question) return null;
        return {
          question,
          viewedAt: h.timestamp,
        };
      })
    );

    return questions.filter((q): q is NonNullable<typeof q> => q !== null);
  },
});

export const updateUserSettings = mutation({
  args: {
    defaultStyle: v.optional(v.string()),
    defaultTone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);

    await ctx.db.patch(user._id, {
      defaultStyle: args.defaultStyle,
      defaultTone: args.defaultTone,
    });

    return null;
  },
});

export const updateLikedQuestions = mutation({
  args: {
    likedQuestions: v.array(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);

    // Enforce limits for Free tier
    if (user.subscriptionTier !== "casual" && args.likedQuestions.length > 100) {
      throw new Error("Free plan limit: You can only like up to 100 questions. Upgrade to Casual for unlimited.");
    }

    // Delete existing liked questions for this user
    const existingLikedQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("by_userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();

    for (const uq of existingLikedQuestions) {
      await ctx.db.delete(uq._id);
    }

    // Insert new liked questions
    const now = Date.now();
    for (const questionId of args.likedQuestions) {
      await ctx.db.insert("userQuestions", {
        userId: user._id,
        questionId,
        status: "liked",
        updatedAt: now,
      });
    }

    return null;
  },
});

export const updateHiddenQuestions = mutation({
  args: {
    hiddenQuestions: v.array(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);

    // Enforce limits for Free tier
    if (user.subscriptionTier !== "casual" && args.hiddenQuestions.length > 100) {
      throw new Error("Free plan limit: You can only hide up to 100 questions. Upgrade to Casual for unlimited.");
    }

    // Delete existing hidden questions for this user
    const existingHiddenQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("by_userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "hidden")
      )
      .collect();

    for (const uq of existingHiddenQuestions) {
      await ctx.db.delete(uq._id);
    }

    // Insert new hidden questions
    const now = Date.now();
    for (const questionId of args.hiddenQuestions) {
      await ctx.db.insert("userQuestions", {
        userId: user._id,
        questionId,
        status: "hidden",
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.users.updateUserPreferenceEmbeddingAction, {
      userId: user._id,
    });
    return null;
  },
});

export const updateHiddenStyles = mutation({
  args: {
    hiddenStyles: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);

    // Delete existing hidden styles for this user
    const existingHiddenStyles = await ctx.db
      .query("userStyles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const us of existingHiddenStyles) {
      await ctx.db.delete(us._id);
    }

    // Insert new hidden styles
    const now = Date.now();
    for (const styleId of args.hiddenStyles) {
      await ctx.db.insert("userStyles", {
        userId: user._id,
        styleId,
        updatedAt: now,
        status: "hidden",
      });
    }

    return null;
  },
});

export const updateHiddenTones = mutation({
  args: {
    hiddenTones: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserOrCreate(ctx);

    // Delete existing hidden tones for this user
    const existingHiddenTones = await ctx.db
      .query("userTones")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const ut of existingHiddenTones) {
      await ctx.db.delete(ut._id);
    }

    // Insert new hidden tones
    const now = Date.now();
    for (const toneId of args.hiddenTones) {
      await ctx.db.insert("userTones", {
        userId: user._id,
        toneId,
        updatedAt: now,
        status: "hidden",
      });
    }

    return null;
  },
});

export const makeAdmin = mutation({
  args: {
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const tempUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!tempUser || !tempUser.isAdmin) {
      throw new Error("Not authorized to make admins");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, { isAdmin: true });
    return null;
  },
});

export const getUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("users").withIndex("by_id", (q) => q.eq("_id", args.userId)).unique();
  },
});

export const getUserLikedQuestions = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("userQuestions")
      .withIndex("by_userIdAndStatus", (q) => q.eq("userId", args.userId).eq("status", "liked"))
      .collect();
  },
});

export const updateUserPreferenceEmbedding = internalMutation({
  args: {
    userId: v.id("users"),
    questionPreferenceEmbedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { questionPreferenceEmbedding: args.questionPreferenceEmbedding });
  },
});

export const updateUserPreferenceEmbeddingAction = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {

    const user = await ctx.runQuery(internal.users.getUser, {
      userId: args.userId,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const userQuestions = await ctx.runQuery(internal.users.getUserLikedQuestions, {
      userId: args.userId,
    });

    const userQuestionEmbeddings = userQuestions.map(async (uq: any) => {
      const embedding = await ctx.runQuery(internal.questions.getQuestionEmbedding, {
        questionId: uq.questionId,
      });
      if (!embedding) {
        return [];
      }
      return embedding;
    });

    const averageEmbedding = calculateAverageEmbedding(await Promise.all(userQuestionEmbeddings));

    await ctx.runMutation(internal.users.updateUserPreferenceEmbedding, {
      userId: args.userId,
      questionPreferenceEmbedding: averageEmbedding,
    });

    return null;
  },
});


function calculateAverageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return []; // Return an empty array if no embeddings are provided
  }

  // Get the dimensionality of the embeddings (assuming all have the same length)
  const embeddingDimension = embeddings[0].length;

  // Initialize an array to store the sum of the embedding components
  const sumEmbedding: number[] = new Array(embeddingDimension).fill(0);

  // Sum the corresponding components of each embedding
  for (const embedding of embeddings) {
    for (let i = 0; i < embeddingDimension; i++) {
      sumEmbedding[i] += embedding[i];
    }
  }

  // Divide each component of the sum by the number of embeddings to get the average
  const averageEmbedding: number[] = sumEmbedding.map(
    (component) => component / embeddings.length
  );

  return averageEmbedding;
}

export const getUsersWithMissingEmbeddings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").filter((q) => q.eq(q.field("questionPreferenceEmbedding"), undefined)).collect();
  },
});

export const updateUsersWithMissingEmbeddingsAction = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.runQuery(internal.users.getUsersWithMissingEmbeddings);
    for (const user of users) {
      await ctx.runAction(internal.users.updateUserPreferenceEmbeddingAction, {
        userId: user._id,
      });
    }
  },
});