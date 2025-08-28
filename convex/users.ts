import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const makeAdmin = mutation({
  args: {
    email: v.string(),
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

    if (!user || !user.isAdmin) {
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
