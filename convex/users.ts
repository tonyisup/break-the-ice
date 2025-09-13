import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      return null;
    }

    return {
      likedQuestions: user.likedQuestions,
      hiddenQuestions: user.hiddenQuestions,
      autoAdvanceShuffle: user.autoAdvanceShuffle,
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      likedQuestions: args.likedQuestions,
      hiddenQuestions: args.hiddenQuestions,
      autoAdvanceShuffle: args.autoAdvanceShuffle,
      migratedFromLocalStorage: true,
    });
  },
});

export const updateLikedQuestions = mutation({
  args: {
    likedQuestions: v.array(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      likedQuestions: args.likedQuestions,
    });
  },
});

export const updateHiddenQuestions = mutation({
  args: {
    hiddenQuestions: v.array(v.id("questions")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      hiddenQuestions: args.hiddenQuestions,
    });
  },
});

export const updateAutoAdvanceShuffle = mutation({
  args: {
    autoAdvanceShuffle: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      autoAdvanceShuffle: args.autoAdvanceShuffle,
    });
  },
});

export const makeAdmin = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const tempUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email!))
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
  },
});
