import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureOrgMember, ensurePaidOrganizationMember } from "../auth";
import { collectUserCandidates, findCanonicalUser } from "../lib/users";

const MEMBERSHIPS_QUERY_CAP = 100;

/** Used from actions (e.g. matrix fill) to verify the caller belongs to the org. */
export const assertOrgMembershipForCurrentUser = internalQuery({
	args: { organizationId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensureOrgMember(ctx, args.organizationId, ["admin", "manager", "member"]);
		return null;
	},
});

export const createOrganization = mutation({
	args: {
		name: v.string(),
	},
	returns: v.id("organizations"),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called createOrganization without authentication.");
		}

		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

		if (!user) {
			throw new Error("User not found");
		}

		const organizationId = await ctx.db.insert("organizations", {
			name: args.name,
		});

		await ctx.db.insert("organization_members", {
			userId: user._id,
			organizationId: organizationId,
			role: "admin",
		});

		return organizationId;
	},
});

export const inviteMember = mutation({
	args: {
		email: v.string(),
		organizationId: v.id("organizations"),
		role: v.union(
			v.literal("admin"),
			v.literal("manager"),
			v.literal("member")
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ensurePaidOrganizationMember(ctx, args.organizationId, "admin");

		await ctx.db.insert("invitations", {
			email: args.email,
			organizationId: args.organizationId,
			role: args.role,
		});

		return null;
	},
});

export const acceptInvitation = mutation({
	args: {
		invitationId: v.id("invitations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Called acceptInvitation without authentication.");
		}

		const user = await findCanonicalUser(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

		if (!user) {
			throw new Error("User not found");
		}

		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation) {
			throw new Error("Invitation not found.");
		}

		// Validate that the invitation is for the accepting user's email
		if (invitation.email.toLowerCase() !== identity.email?.toLowerCase()) {
			throw new Error("This invitation is for a different email address.");
		}

		// check if user is already a member of an organization
		const existingMembership = await ctx.db
			.query("organization_members")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.unique();

		if (existingMembership) {
			throw new Error("User is already a member of an organization.");
		}

		await ctx.db.insert("organization_members", {
			userId: user._id,
			organizationId: invitation.organizationId,
			role: invitation.role,
		});

		await ctx.db.delete(args.invitationId);

		return null;
	},
});

export const getOrganizations = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const { candidates } = await collectUserCandidates(ctx, {
			clerkId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email,
		});

		if (candidates.length === 0) {
			return [];
		}

		const membershipRows: Doc<"organization_members">[] = [];
		for (const user of candidates) {
			const rows = await ctx.db
				.query("organization_members")
				.withIndex("by_userId", (q) => q.eq("userId", user._id))
				.order("desc")
				.take(MEMBERSHIPS_QUERY_CAP);
			membershipRows.push(...rows);
		}

		membershipRows.sort((a, b) => b._creationTime - a._creationTime);
		const seenOrg = new Set<string>();
		const orgIds: Id<"organizations">[] = [];
		for (const m of membershipRows) {
			const key = m.organizationId as string;
			if (seenOrg.has(key)) continue;
			seenOrg.add(key);
			orgIds.push(m.organizationId);
			if (orgIds.length >= MEMBERSHIPS_QUERY_CAP) break;
		}

		const organizations = await Promise.all(orgIds.map((id) => ctx.db.get(id)));

		return organizations.filter((o) => o !== null);
	},
});

const INVITATIONS_PAGE_CAP = 100;

export const getInvitations = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || !identity.email) {
			return [];
		}

		return ctx.db
			.query("invitations")
			.withIndex("by_email", (q) => q.eq("email", identity.email!))
			.take(INVITATIONS_PAGE_CAP);
	},
});

const DEFAULT_MEMBERS_LIMIT = 200;

export const getMembers = query({
	args: {
		organizationId: v.id("organizations"),
		limit: v.optional(v.number()),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await ensureOrgMember(ctx, args.organizationId);

		const cap = Math.min(args.limit ?? DEFAULT_MEMBERS_LIMIT, 500);

		return ctx.db
			.query("organization_members")
			.withIndex("by_organizationId", (q) =>
				q.eq("organizationId", args.organizationId)
			)
			.take(cap);
	},
});