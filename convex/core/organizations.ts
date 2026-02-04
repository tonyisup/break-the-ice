import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember } from "../auth";

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

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

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
		await ensureOrgMember(ctx, args.organizationId, "admin");

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

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

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

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", identity.email))
			.unique();

		if (!user) {
			return [];
		}

		const memberships = await ctx.db
			.query("organization_members")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.collect();

		const organizations = await Promise.all(
			memberships.map((m) => ctx.db.get(m.organizationId))
		);

		return organizations.filter((o) => o !== null);
	},
});

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
			.collect();
	},
});

export const getMembers = query({
	args: {
		organizationId: v.id("organizations"),
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await ensureOrgMember(ctx, args.organizationId);

		return ctx.db
			.query("organization_members")
			.withIndex("by_organizationId", (q) =>
				q.eq("organizationId", args.organizationId)
			)
			.collect();
	},
});
