import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  upsertClerkLinkedOrganization,
  type OrganizationRole,
} from "../lib/clerkOrgSync";

const organizationRoleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member")
);

/**
 * Called from the Clerk API–verified org sync action (when JWT has no org claims).
 * Do not call from the client directly.
 */
export const applyOrganizationSync = internalMutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
    clerkOrganizationId: v.string(),
    organizationName: v.string(),
    organizationRole: organizationRoleValidator,
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    return await upsertClerkLinkedOrganization(ctx, {
      email: args.email,
      displayName: args.displayName,
      pictureUrl: args.pictureUrl,
      clerkOrganizationId: args.clerkOrganizationId,
      organizationName: args.organizationName,
      organizationRole: args.organizationRole as OrganizationRole,
    });
  },
});

/**
 * Force-apply subscription status to an organization.
 * Creates the org if it doesn't exist, then updates plan/billing.
 * Called from admin actions that query Clerk's REST API directly.
 */
export const forceApplyOrgSubscription = internalMutation({
  args: {
    clerkOrganizationId: v.string(),
    organizationName: v.string(),
    planTier: v.union(v.literal("free"), v.literal("team")),
    billingStatus: v.union(
      v.literal("inactive"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("trialing")
    ),
    clerkCustomerId: v.optional(v.string()),
    clerkSubscriptionId: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    organizationRole: v.optional(organizationRoleValidator),
  },
  returns: v.union(v.id("organizations"), v.null()),
  handler: async (ctx, args) => {
    // Find or create the organization
    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_clerkOrganizationId", (q) =>
        q.eq("clerkOrganizationId", args.clerkOrganizationId)
      )
      .unique();

    if (!organization) {
      // Create the org
      const orgId = await ctx.db.insert("organizations", {
        name: args.organizationName,
        clerkOrganizationId: args.clerkOrganizationId,
        planTier: args.planTier,
        billingStatus: args.billingStatus,
        clerkCustomerId: args.clerkCustomerId,
        clerkSubscriptionId: args.clerkSubscriptionId,
      });
      organization = (await ctx.db.get(orgId)) ?? null;

      // Also create membership for the user
      if (organization && args.clerkUserId && args.organizationRole) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkUserId))
          .first();
        if (user) {
          await ctx.db.insert("organization_members", {
            userId: user._id,
            organizationId: organization._id,
            role: args.organizationRole,
          });
        }
      }
    } else {
      // Update existing org
      await ctx.db.patch(organization._id, {
        planTier: args.planTier,
        billingStatus: args.billingStatus,
        clerkCustomerId: args.clerkCustomerId,
        clerkSubscriptionId: args.clerkSubscriptionId,
        ...(args.organizationName !== "Team" && args.organizationName !== organization.name
          ? { name: args.organizationName }
          : {}),
      });
    }

    return organization?._id ?? null;
  },
});
