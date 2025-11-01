import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
      migratedFromLocalStorage: v.optional(v.boolean()),
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
      .withIndex("userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "liked")
      )
      .collect();
    const likedQuestions = likedUserQuestions.map((uq) => uq.questionId);

    // Get hidden questions from userQuestions table
    const hiddenUserQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("userIdAndStatus", (q) =>
        q.eq("userId", user._id).eq("status", "hidden")
      )
      .collect();
    const hiddenQuestions = hiddenUserQuestions.map((uq) => uq.questionId);

    // Get hidden styles from userHiddenStyles table
    const hiddenStylesDocs = await ctx.db
      .query("userHiddenStyles")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    const hiddenStyles = hiddenStylesDocs.map((us) => us.styleId);

    // Get hidden tones from userHiddenTones table
    const hiddenTonesDocs = await ctx.db
      .query("userHiddenTones")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    const hiddenTones = hiddenTonesDocs.map((ut) => ut.toneId);

    return {
      likedQuestions: likedQuestions.length > 0 ? likedQuestions : undefined,
      hiddenQuestions: hiddenQuestions.length > 0 ? hiddenQuestions : undefined,
      hiddenStyles: hiddenStyles.length > 0 ? hiddenStyles : undefined,
      hiddenTones: hiddenTones.length > 0 ? hiddenTones : undefined,
      migratedFromLocalStorage: user.migratedFromLocalStorage,
    };
  },
});

export const migrateLocalStorageSettings = mutation({
  args: {
    likedQuestions: v.array(v.id("questions")),
    hiddenQuestions: v.array(v.id("questions")),
    hiddenStyles: v.optional(v.array(v.string())),
    hiddenTones: v.optional(v.array(v.string())),
    autoAdvanceShuffle: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users") 
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete existing userQuestions entries for this user
    const existingUserQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    
    for (const uq of existingUserQuestions) {
      await ctx.db.delete(uq._id);
    }

    // Delete existing hidden styles and tones
    const existingHiddenStyles = await ctx.db
      .query("userHiddenStyles")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    
    for (const us of existingHiddenStyles) {
      await ctx.db.delete(us._id);
    }

    const existingHiddenTones = await ctx.db
      .query("userHiddenTones")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    
    for (const ut of existingHiddenTones) {
      await ctx.db.delete(ut._id);
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

    // Insert new hidden questions
    for (const questionId of args.hiddenQuestions) {
      await ctx.db.insert("userQuestions", {
        userId: user._id,
        questionId,
        status: "hidden",
        updatedAt: now,
      });
    }

    // Insert new hidden styles
    if (args.hiddenStyles) {
      for (const styleId of args.hiddenStyles) {
        await ctx.db.insert("userHiddenStyles", {
          userId: user._id,
          styleId,
          updatedAt: now,
        });
      }
    }

    // Insert new hidden tones
    if (args.hiddenTones) {
      for (const toneId of args.hiddenTones) {
        await ctx.db.insert("userHiddenTones", {
          userId: user._id,
          toneId,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(user._id, {
      migratedFromLocalStorage: true,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete existing liked questions for this user
    const existingLikedQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("userIdAndStatus", (q) =>
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete existing hidden questions for this user
    const existingHiddenQuestions = await ctx.db
      .query("userQuestions")
      .withIndex("userIdAndStatus", (q) =>
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

    return null;
  },
});

export const updateHiddenStyles = mutation({
  args: {
    hiddenStyles: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete existing hidden styles for this user
    const existingHiddenStyles = await ctx.db
      .query("userHiddenStyles")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    
    for (const us of existingHiddenStyles) {
      await ctx.db.delete(us._id);
    }

    // Insert new hidden styles
    const now = Date.now();
    for (const styleId of args.hiddenStyles) {
      await ctx.db.insert("userHiddenStyles", {
        userId: user._id,
        styleId,
        updatedAt: now,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete existing hidden tones for this user
    const existingHiddenTones = await ctx.db
      .query("userHiddenTones")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    
    for (const ut of existingHiddenTones) {
      await ctx.db.delete(ut._id);
    }

    // Insert new hidden tones
    const now = Date.now();
    for (const toneId of args.hiddenTones) {
      await ctx.db.insert("userHiddenTones", {
        userId: user._id,
        toneId,
        updatedAt: now,
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
