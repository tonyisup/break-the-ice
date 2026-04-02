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
    clerkUserId: v.string(),
    tokenIdentifier: v.string(),
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
      clerkUserId: args.clerkUserId,
      tokenIdentifier: args.tokenIdentifier,
      email: args.email,
      displayName: args.displayName,
      pictureUrl: args.pictureUrl,
      clerkOrganizationId: args.clerkOrganizationId,
      organizationName: args.organizationName,
      organizationRole: args.organizationRole as OrganizationRole,
    });
  },
});
