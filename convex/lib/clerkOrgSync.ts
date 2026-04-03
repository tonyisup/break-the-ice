import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getOrCreateCanonicalUser } from "./users";

export type OrganizationRole = "admin" | "manager" | "member";

/** Normalized org fields from Clerk JWT / identity claims (before role mapping). */
export type ParsedClerkIdentityClaims = {
  clerkOrganizationId: string | null;
  roleValue: string | null;
  organizationName: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Parse Clerk organization claims from a Convex user identity / JWT payload.
 * Handles nested `o` object and common Clerk claim key variants.
 */
export function parseClerkIdentityClaims(
  identity: Record<string, unknown>,
): ParsedClerkIdentityClaims {
  const orgClaim = identity.o;
  const nestedOrg =
    orgClaim && typeof orgClaim === "object" && !Array.isArray(orgClaim)
      ? (orgClaim as Record<string, unknown>)
      : null;

  const clerkOrganizationId =
    readString(identity.org_id) ??
    (nestedOrg ? readString(nestedOrg.id) : null) ??
    readString(identity.organization_id) ??
    readString(identity.organizationId);

  const roleValue =
    readString(identity.org_role) ??
    (nestedOrg ? readString(nestedOrg.rol) : null) ??
    readString(identity.orgRole);

  const organizationName =
    (nestedOrg ? readString(nestedOrg.name) : null) ??
    (nestedOrg ? readString(nestedOrg.nam) : null) ??
    readString(identity.org_name) ??
    readString(identity.organization_name);

  return {
    clerkOrganizationId,
    roleValue,
    organizationName,
  };
}

/** Map Clerk session / API role strings to our stored role. */
export function normalizeClerkApiRole(role?: string | null): OrganizationRole | null {
  return role === "org:admin" || role === "admin"
    ? "admin"
    : role === "org:manager" || role === "manager"
      ? "manager"
      : role === "org:member" || role === "member"
        ? "member"
        : null;
}

/**
 * Create or update the Convex organization row and membership for a Clerk org.
 * Used by JWT-based sync and by Clerk API–verified sync when org claims are missing from the Convex token.
 */
export async function upsertClerkLinkedOrganization(
  ctx: MutationCtx,
  params: {
    email?: string;
    displayName?: string;
    pictureUrl?: string;
    clerkOrganizationId: string;
    organizationName: string;
    organizationRole: OrganizationRole;
  }
): Promise<Id<"organizations">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject || !identity.tokenIdentifier) {
    throw new Error("Not authenticated");
  }

  const clerkOrganizationId = params.clerkOrganizationId.trim();
  const organizationName = params.organizationName.trim();
  if (!clerkOrganizationId) {
    throw new Error("Invalid Clerk organization id");
  }
  if (!organizationName) {
    throw new Error("Invalid organization name");
  }

  const user = await getOrCreateCanonicalUser(ctx, {
    clerkId: identity.subject,
    tokenIdentifier: identity.tokenIdentifier,
    email: params.email,
    name: params.displayName ?? params.email,
    image: params.pictureUrl,
  });

  let organization = await ctx.db
    .query("organizations")
    .withIndex("by_clerkOrganizationId", (q) =>
      q.eq("clerkOrganizationId", clerkOrganizationId)
    )
    .unique();

  if (!organization) {
    const organizationId = await ctx.db.insert("organizations", {
      name: organizationName,
      clerkOrganizationId,
      planTier: "free",
      billingStatus: "inactive",
    });
    organization = await ctx.db.get(organizationId);
  } else if (organization.name !== organizationName) {
    await ctx.db.patch(organization._id, { name: organizationName });
    organization = await ctx.db.get(organization._id);
  }

  if (!organization) {
    throw new Error("Failed to sync organization");
  }

  const existingMembership = await ctx.db
    .query("organization_members")
    .withIndex("by_userId_organizationId", (q) =>
      q.eq("userId", user._id).eq("organizationId", organization._id)
    )
    .unique();

  if (!existingMembership) {
    await ctx.db.insert("organization_members", {
      userId: user._id,
      organizationId: organization._id,
      role: params.organizationRole,
    });
  } else if (existingMembership.role !== params.organizationRole) {
    await ctx.db.patch(existingMembership._id, { role: params.organizationRole });
  }

  return organization._id;
}
