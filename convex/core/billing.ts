import { getAiPlanLimit } from "../lib/aiPlanLimits";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { collectUserCandidates } from "../lib/users";
import { ignoredWorkspaceArg } from "../lib/ignoredWorkspaceArg";

/**
 * What the caller's account allows. Billing is per person: the subscription fields live on
 * the `users` row, written by the Clerk webhook. There is one plan, so everyone gets its
 * AI allowance. The app no longer calls it; apps loaded before workspaces were removed still
 * do, on the feed and the settings page. Remove it once those tabs are gone.
 */
export const getEffectiveEntitlements = query({
  args: { ...ignoredWorkspaceArg },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      return null;
    }

    const { candidates } = await collectUserCandidates(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });

    if (candidates.length === 0) {
      return null;
    }

    const user = candidates[0];

    return {
      userId: user._id,
      planTier: "free" as const,
      billingStatus: user.billingStatus ?? "inactive",
      aiLimit: getAiPlanLimit(),
      billingSubjectType: user.billingSubjectType ?? "user",
    };
  },
});
