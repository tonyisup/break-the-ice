import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("env_variables")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});