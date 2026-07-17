import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember } from "../auth";
import { isValidTimeZone } from "../lib/timezone";

const DELIVERY_DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;
type DeliveryDay = typeof DELIVERY_DAYS[number];

const deliveryDayValidator = v.union(
  v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
  v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday"),
);

function assertValidDeliveryDays(days: readonly string[]) {
  if (days.length < 1 || days.length > DELIVERY_DAYS.length) {
    throw new Error("Select between 1 and 7 delivery days");
  }
  if (new Set(days).size !== days.length || days.some((day) => !DELIVERY_DAYS.includes(day as typeof DELIVERY_DAYS[number]))) {
    throw new Error("Delivery days must be unique days of the week");
  }
}

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
    activeDeliveryDays: v.optional(v.array(deliveryDayValidator)),
    timeZone: v.optional(v.string()),
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
        activeDeliveryDays: undefined,
        timeZone: undefined,
        defaultAxisY: undefined,
        defaultAxisX: undefined,
      };
    }

    return {
      _id: settings._id,
      weekStartDay: settings.weekStartDay,
      activeDeliveryDays: settings.activeDeliveryDays,
      timeZone: settings.timeZone,
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
    activeDeliveryDays: v.optional(v.array(deliveryDayValidator)),
    timeZone: v.optional(v.string()),
    defaultAxisY: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
    defaultAxisX: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
  },
  returns: v.id("orgSettings"),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId, ["admin", "manager"]);
    if (args.timeZone !== undefined && !isValidTimeZone(args.timeZone)) {
      throw new Error("Invalid IANA time zone");
    }
    if (args.activeDeliveryDays !== undefined) {
      assertValidDeliveryDays(args.activeDeliveryDays);
    }

    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (args.weekStartDay !== undefined) patch.weekStartDay = args.weekStartDay;
      if (args.activeDeliveryDays !== undefined) patch.activeDeliveryDays = args.activeDeliveryDays;
      if (args.timeZone !== undefined) patch.timeZone = args.timeZone;
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
      activeDeliveryDays: args.activeDeliveryDays ?? [...DELIVERY_DAYS],
      timeZone: args.timeZone,
      defaultAxisY: args.defaultAxisY,
      defaultAxisX: args.defaultAxisX,
    });

    return newId;
  },
});

/** Atomically enable or disable one delivery day without replacing concurrent changes. */
export const setDeliveryDayActive = mutation({
  args: {
    organizationId: v.id("organizations"),
    day: deliveryDayValidator,
    active: v.boolean(),
  },
  returns: v.array(deliveryDayValidator),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId, ["admin", "manager"]);

    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    const currentDays: DeliveryDay[] = existing?.activeDeliveryDays?.length
      ? existing.activeDeliveryDays
      : [...DELIVERY_DAYS];
    const nextDays = DELIVERY_DAYS.filter((day) =>
      day === args.day ? args.active : currentDays.includes(day)
    );

    assertValidDeliveryDays(nextDays);
    if (existing) {
      await ctx.db.patch(existing._id, { activeDeliveryDays: nextDays });
    } else {
      await ctx.db.insert("orgSettings", {
        organizationId: args.organizationId,
        weekStartDay: "monday",
        activeDeliveryDays: nextDays,
      });
    }

    return nextDays;
  },
});
