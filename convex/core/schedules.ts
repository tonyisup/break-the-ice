import type { GenericId } from "convex/values";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember } from "../auth";
import { findCanonicalUser } from "../lib/users";

/** Full schedule row as returned from the database (matches `schedules` table + system fields). */
const scheduleDocValidator = v.object({
  _id: v.id("schedules"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  weekStart: v.string(),
  weekEnd: v.string(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("completed")),
  weekStartDay: v.union(v.literal("monday"), v.literal("sunday")),
  axisY: v.optional(v.union(v.literal("style"), v.literal("tone"), v.literal("topic"))),
  axisYSlugs: v.optional(v.array(v.string())),
  axisX: v.optional(v.union(v.literal("style"), v.literal("tone"), v.literal("topic"))),
  axisXSlugs: v.optional(v.array(v.string())),
  axisOverall: v.optional(v.union(
    v.literal("style"), v.literal("tone"), v.literal("topic"), v.literal("random")
  )),
  axisOverallSlug: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()),
  createdBy: v.optional(v.id("users")),
});

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

/** List all schedules for an org, ordered by weekStart desc */
export const listSchedules = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(scheduleDocValidator),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId);
    const cap = Math.min(args.limit ?? 200, 500);
    return ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(cap);
  },
});

/** List all schedules for any org the current user is a member of */
export const listSchedulesForUser = query({
  args: {
    limitPerOrg: v.optional(v.number()),
  },
  returns: v.array(scheduleDocValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });

    if (!user) return [];

    const memberships = await ctx.db
      .query("organization_members")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    if (memberships.length === 0) return [];

    const orgIdSet = new Set(memberships.map((m) => m.organizationId));
    const allSchedules = [];

    const perOrgCap = Math.min(args.limitPerOrg ?? 50, 200);
    for (const orgId of orgIdSet) {
      const orgSchedules = await ctx.db
        .query("schedules")
        .withIndex("by_org_weekStart", (q) => q.eq("organizationId", orgId))
        .order("desc")
        .take(perOrgCap);
      allSchedules.push(...orgSchedules);
    }

    allSchedules.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return allSchedules;
  },
});

type AssignmentEntry = {
  _id: GenericId<"scheduledQuestions">;
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  slotOrder: number;
  assignedBy: GenericId<"users"> | undefined;
  question: {
    _id: GenericId<"questions">;
    text: string | undefined;
    style: string | undefined;
    tone: string | undefined;
    topic: string | undefined;
    isAIGenerated: boolean | undefined;
    totalLikes: number;
  };
};

/** Get a single schedule with all assigned questions joined in */
export const getSchedule = query({
  args: { scheduleId: v.id("schedules") },
  returns: v.object({
    schedule: scheduleDocValidator,
    assignments: v.array(v.object({
      _id: v.id("scheduledQuestions"),
      dayOfWeek: v.union(
        v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
        v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
      ),
      slotOrder: v.number(),
      question: v.object({
        _id: v.id("questions"),
        text: v.optional(v.string()),
        style: v.optional(v.string()),
        tone: v.optional(v.string()),
        topic: v.optional(v.string()),
        isAIGenerated: v.optional(v.boolean()),
        totalLikes: v.number(),
      }),
      assignedBy: v.optional(v.id("users")),
    })),
  }),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId);

    const assignments = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    const enriched: AssignmentEntry[] = [];
    for (const a of assignments) {
      const question = await ctx.db.get(a.questionId);
      if (question) {
        enriched.push({
          _id: a._id,
          dayOfWeek: a.dayOfWeek,
          slotOrder: a.slotOrder,
          assignedBy: a.assignedBy,
          question: {
            _id: question._id,
            text: question.text,
            style: question.style,
            tone: question.tone,
            topic: question.topic,
            isAIGenerated: question.isAIGenerated,
            totalLikes: question.totalLikes,
          },
        });
      }
    }

    return { schedule, assignments: enriched };
  },
});

/** Coach/manager view: what's this week's schedule and today's question? */
export const getCurrentWeekSchedule = query({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    scheduleId: v.optional(v.id("schedules")),
    weekStart: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"), v.literal("completed"))),
    todayAssignment: v.optional(v.object({
      _id: v.id("scheduledQuestions"),
      dayOfWeek: v.union(
        v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
        v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
      ),
      question: v.object({
        _id: v.id("questions"),
        text: v.optional(v.string()),
        style: v.optional(v.string()),
        tone: v.optional(v.string()),
        topic: v.optional(v.string()),
      }),
      scheduledQuestionId: v.id("scheduledQuestions"),
    })),
  }),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId);
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("weekStart"), todayIso),
          q.gte(q.field("weekEnd"), todayIso),
          q.or(
            q.eq(q.field("status"), "published"),
            q.eq(q.field("status"), "draft")
          )
        )
      )
      .first();

    if (!schedule) {
      return { scheduleId: undefined, weekStart: undefined, status: undefined, todayAssignment: undefined };
    }

    const dayOfWeek = getDayOfWeekLabel(now);
    const sq = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule_day", (q) =>
        q.eq("scheduleId", schedule._id).eq("dayOfWeek", dayOfWeek)
      )
      .first();

    let todayAssignment = undefined;
    if (sq) {
      const question = await ctx.db.get(sq.questionId);
      if (question) {
        todayAssignment = {
          _id: sq._id,
          dayOfWeek: sq.dayOfWeek,
          scheduledQuestionId: sq._id,
          question: {
            _id: question._id,
            text: question.text,
            style: question.style,
            tone: question.tone,
            topic: question.topic,
          },
        };
      }
    }

    return { scheduleId: schedule._id, weekStart: schedule.weekStart, status: schedule.status, todayAssignment };
  },
});

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

export const createSchedule = mutation({
  args: {
    organizationId: v.id("organizations"),
    weekStart: v.string(),
    weekStartDay: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId, ["admin", "manager"]);
    const identity = await ctx.auth.getUserIdentity();
    const user = await findCanonicalUser(ctx, {
      clerkId: identity?.subject,
      tokenIdentifier: identity?.tokenIdentifier,
      email: identity?.email,
    });

    const weekStartDay = args.weekStartDay ?? "monday";
    const weekEnd = computeWeekEnd(args.weekStart, weekStartDay);
    const now = Date.now();

    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId).eq("weekStart", args.weekStart)
      )
      .unique();

    if (existing) return existing._id;

    return ctx.db.insert("schedules", {
      organizationId: args.organizationId,
      weekStart: args.weekStart,
      weekEnd,
      status: "draft",
      weekStartDay,
      createdAt: now,
      updatedAt: now,
      createdBy: user?._id,
    });
  },
});

export const assignQuestion = mutation({
  args: {
    scheduleId: v.id("schedules"),
    dayOfWeek: v.union(
      v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
      v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
    ),
    questionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    const existing = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule_day", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("dayOfWeek", args.dayOfWeek),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("scheduledQuestions", {
      scheduleId: args.scheduleId,
      dayOfWeek: args.dayOfWeek,
      questionId: args.questionId,
      slotOrder: 0,
      assignedAt: Date.now(),
    });
    return null;
  },
});

export const unassignQuestion = mutation({
  args: { scheduledQuestionId: v.id("scheduledQuestions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sq = await ctx.db.get(args.scheduledQuestionId);
    if (!sq) throw new Error("Assignment not found");
    const schedule = await ctx.db.get(sq.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    await ctx.db.delete(args.scheduledQuestionId);
    return null;
  },
});

export const publishSchedule = mutation({
  args: { scheduleId: v.id("schedules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId, ["admin", "manager"]);

    await ctx.db.patch(args.scheduleId, {
      status: "published",
      publishedAt: Date.now(),
    });
    return null;
  },
});

/** Auto-fill a week with shuffled public questions */
export const autoSchedule = mutation({
  args: { scheduleId: v.id("schedules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    const daysOfWeek = getDaysOfWeek(schedule.weekStart, schedule.weekStartDay);
    const now = Date.now();

    let candidates = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "public"))
      .collect();

    if (candidates.length === 0) {
      throw new Error("No public questions available. Generate some via the admin AI generator.");
    }

    const existingAssignments = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    const assignedQIds = new Set(existingAssignments.map((a) => a.questionId));
    candidates = candidates.filter((q) => !assignedQIds.has(q._id));

    if (candidates.length === 0) {
      throw new Error("All public questions are already assigned this week.");
    }

    candidates.sort(() => Math.random() - 0.5);

    for (let i = 0; i < 7; i++) {
      const day = daysOfWeek[i];
      const existingDay = await ctx.db
        .query("scheduledQuestions")
        .withIndex("by_schedule_day", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("dayOfWeek", day),
        )
        .first();
      if (existingDay) {
        await ctx.db.delete(existingDay._id);
      }
      const q = candidates[i % candidates.length];
      await ctx.db.insert("scheduledQuestions", {
        scheduleId: args.scheduleId,
        dayOfWeek: day,
        questionId: q._id,
        slotOrder: 0,
        assignedAt: now,
      });
    }

    await ctx.db.patch(args.scheduleId, { updatedAt: now });
    return null;
  },
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

type DayOfWeek =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

const DAYS_ORDERED: DayOfWeek[] = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

function computeWeekEnd(weekStart: string, _weekStartDay: string): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end.toISOString().slice(0, 10);
}

function getDaysOfWeek(_weekStart: string, weekStartDay: "monday" | "sunday"): DayOfWeek[] {
  const startIdx = weekStartDay === "monday" ? 1 : 0;
  return [...DAYS_ORDERED.slice(startIdx), ...DAYS_ORDERED.slice(0, startIdx)].slice(0, 7);
}

function getDayOfWeekLabel(date: Date): DayOfWeek {
  return DAYS_ORDERED[date.getDay()];
}
