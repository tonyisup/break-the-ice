import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { GenericMutationCtx } from "convex/server";

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

export async function getOrCreateUser(
  ctx: GenericMutationCtx<any>,
  args: {
    existingUserId: any;
    profile: any;
  }
) {
  if (args.existingUserId) {
    return args.existingUserId;
  }
  const userFromDb = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", args.profile.email))
    .unique();

  if (userFromDb) {
    return userFromDb._id;
  }

  const newUser = await ctx.db.insert("users", {
    email: args.profile.email,
    name: args.profile.name,
    image: args.profile.pictureUrl,
    likedQuestions: [],
    hiddenQuestions: [],
    autoAdvanceShuffle: false,
    migratedFromLocalStorage: false,
  });

  return newUser;
}

export const me = query({
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

    return user;
  },
});
