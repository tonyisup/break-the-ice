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

    return {
      likedQuestions: user.likedQuestions,
      hiddenQuestions: user.hiddenQuestions,
      hiddenStyles: user.hiddenStyles,
      hiddenTones: user.hiddenTones,
      migratedFromLocalStorage: user.migratedFromLocalStorage,
    };
  },
});

export const migrateLocalStorageSettings = mutation({
  args: {
    likedQuestions: v.array(v.id("questions")),
    hiddenQuestions: v.array(v.id("questions")),
    autoAdvanceShuffle: v.boolean(),
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

    await ctx.db.patch(user._id, {
      likedQuestions: args.likedQuestions,
      hiddenQuestions: args.hiddenQuestions,
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

    await ctx.db.patch(user._id, {
      likedQuestions: args.likedQuestions,
    });
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

    await ctx.db.patch(user._id, {
      hiddenQuestions: args.hiddenQuestions,
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

    await ctx.db.patch(user._id, {
      hiddenStyles: args.hiddenStyles,
    });
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

    await ctx.db.patch(user._id, {
      hiddenTones: args.hiddenTones,
    });
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
