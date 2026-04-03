"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { normalizeClerkApiRole, type OrganizationRole } from "../lib/clerkOrgSync";

/**
 * When the Convex JWT omits org claims (common if the Clerk JWT template is not customized),
 * verify the user belongs to the given Clerk org via Clerk's REST API, then mirror org +
 * membership into Convex. Requires CLERK_SECRET_KEY on the Convex deployment.
 */
export const syncOrganizationViaClerkApi = action({
  args: {
    clerkOrganizationId: v.string(),
    organizationName: v.string(),
  },
  returns: v.union(v.id("organizations"), v.null()),
  handler: async (ctx, args): Promise<Id<"organizations"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      throw new Error("Not authenticated");
    }

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      console.warn(
        "syncOrganizationViaClerkApi: CLERK_SECRET_KEY is not set; cannot verify org membership."
      );
      return null;
    }

    const userId = identity.subject;
    const url = new URL(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/organization_memberships`
    );
    url.searchParams.set("limit", "100");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Clerk API organization_memberships failed:", res.status, text);
      return null;
    }

    const json = (await res.json()) as {
      data?: Array<{
        role?: string;
        organization?: { id?: string };
      }>;
    };

    const memberships = json.data ?? [];
    const match = memberships.find((m) => m.organization?.id === args.clerkOrganizationId);
    if (!match) {
      return null;
    }

    const normalized = normalizeClerkApiRole(match.role);
    const organizationRole: OrganizationRole = normalized ?? "member";

    return await ctx.runMutation(internal.internal.billing.applyOrganizationSync, {
      clerkUserId: userId,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      displayName: identity.name,
      pictureUrl: identity.pictureUrl,
      clerkOrganizationId: args.clerkOrganizationId,
      organizationName: args.organizationName,
      organizationRole,
    });
  },
});
