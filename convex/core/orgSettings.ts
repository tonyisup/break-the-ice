import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember, ensurePaidOrganizationMember } from "../auth";

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

/** Get org-level curation settings */
export const getOrgSettings = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.object({
    _id: v.optional(v.id("orgSettings")),
    weekStartDay: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
    defaultAxisY: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
    defaultAxisX: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
  }),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId);

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (!settings) {
      return {
        weekStartDay: undefined,
        defaultAxisY: undefined,
        defaultAxisX: undefined,
      };
    }

    return {
      _id: settings._id,
      weekStartDay: settings.weekStartDay,
      defaultAxisY: settings.defaultAxisY,
      defaultAxisX: settings.defaultAxisX,
    };
  },
});

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

/** Create or update org settings */
export const upsertOrgSettings = mutation({
  args: {
    organizationId: v.id("organizations"),
    weekStartDay: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
    defaultAxisY: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
    defaultAxisX: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
  },
  returns: v.id("orgSettings"),
  handler: async (ctx, args) => {
    await ensurePaidOrganizationMember(ctx, args.organizationId, ["admin", "manager"]);

    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (args.weekStartDay !== undefined) patch.weekStartDay = args.weekStartDay;
      if (args.defaultAxisY !== undefined) patch.defaultAxisY = args.defaultAxisY;
      if (args.defaultAxisX !== undefined) patch.defaultAxisX = args.defaultAxisX;

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    const newId = await ctx.db.insert("orgSettings", {
      organizationId: args.organizationId,
      weekStartDay: args.weekStartDay ?? "monday",
      defaultAxisY: args.defaultAxisY,
      defaultAxisX: args.defaultAxisX,
    });

    return newId;
  },
});
