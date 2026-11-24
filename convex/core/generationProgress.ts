import { v } from "convex/values";
import { query } from "../_generated/server";
import { generationProgressStage } from "../lib/generationProgress";
import { findCanonicalUser } from "../lib/users";

/** The stage of one of the signed-in person's own feed generations. */
export const getGenerationProgress = query({
  args: { requestKey: v.string() },
  returns: v.union(v.null(), v.object({ stage: generationProgressStage })),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });
    if (!user) return null;
    const progress = await ctx.db
      .query("generationProgress")
      .withIndex("by_userId_requestKey", (q) => q.eq("userId", user._id).eq("requestKey", args.requestKey))
      .first();
    return progress ? { stage: progress.stage } : null;
  },
});
