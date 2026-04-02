import type { GenericId } from "convex/values";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember, ensurePaidOrganizationMember } from "../auth";
import { findCanonicalUser } from "../lib/users";

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

/** List all schedules for an org, ordered by weekStart desc */
export const listSchedules = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(v.object({
    _id: v.id("schedules"),
    _creationTime: v.number(),
    weekStart: v.string(),
    weekEnd: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("completed")
    ),
    weekStartDay: v.union(v.literal("monday"), v.literal("sunday")),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId);

    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .collect();

    return schedules;
  },
});

/**
 * Get a single schedule with all assigned questions joined in.
 * Returns questions grouped by dayOfWeek.
 */
export const getSchedule = query({
  args: {
    scheduleId: v.id("schedules"),
  },
  returns: v.object({
    schedule: v.object({
      _id: v.id("schedules"),
      _creationTime: v.number(),
      organizationId: v.id("organizations"),
      weekStart: v.string(),
      weekEnd: v.string(),
      status: v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("completed")
      ),
      weekStartDay: v.union(v.literal("monday"), v.literal("sunday")),
      axisY: v.optional(v.union(
        v.literal("style"), v.literal("tone"), v.literal("topic")
      )),
      axisYSlugs: v.optional(v.array(v.string())),
      axisX: v.optional(v.union(
        v.literal("style"), v.literal("tone"), v.literal("topic")
      )),
      axisXSlugs: v.optional(v.array(v.string())),
      axisOverall: v.optional(v.union(
        v.literal("style"), v.literal("tone"), v.literal("topic"), v.literal("random")
      )),
      axisOverallSlug: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      publishedAt: v.optional(v.number()),
      createdBy: v.optional(v.id("users")),
    }),
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

    const enriched = (await Promise.all(
      assignments.map(async (a) => {
        const question = await ctx.db.get(a.questionId);
        if (!question) return null;
        return {
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
        };
      })
    )).filter(Boolean) as Array<{
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
    }>;

    return { schedule, assignments: enriched };
  },
});

/** Get the current week's schedule (published or draft) for a coach's daily view */
export const getCurrentWeekSchedule = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.object({
    scheduleId: v.optional(v.id("schedules")),
    weekStart: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("completed")
    )),
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

    // Find published schedule containing today, or fallback to draft
    const published = await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "published"))
      .filter((q) =>
        q.and(
          q.lte(q.field("weekStart"), todayIso),
          q.gte(q.field("weekEnd"), todayIso)
        )
      )
      .unique();

    const schedule = published ?? await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "draft"))
      .first();

    if (!schedule) {
      return {
        scheduleId: undefined,
        weekStart: undefined,
        status: undefined,
        todayAssignment: undefined,
      };
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

    return {
      scheduleId: schedule._id,
      weekStart: schedule.weekStart,
      status: schedule.status,
      todayAssignment,
    };
  },
});

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

/** Create a new draft schedule for a given week */
export const createSchedule = mutation({
  args: {
    organizationId: v.id("organizations"),
    weekStart: v.string(), // ISO date
    weekStartDay: v.optional(v.union(v.literal("monday"), v.literal("sunday"))),
  },
  returns: v.id("schedules"),
  handler: async (ctx, args) => {
    await ensurePaidOrganizationMember(ctx, args.organizationId, ["admin", "manager"]);

    const user = await findCanonicalUser(ctx, {
      clerkId: (await ctx.auth.getUserIdentity())?.subject,
    });

    const weekStartDay = args.weekStartDay ?? "monday";
    const weekEnd = computeWeekEnd(args.weekStart, weekStartDay);
    const now = Date.now();

    // Check for existing schedule for same week
    const existing = await ctx.db
      .query("schedules")
      .withIndex("by_org_weekStart", (q) =>
        q.eq("organizationId", args.organizationId).eq("weekStart", args.weekStart)
      )
      .unique();

    if (existing) {
      return existing._id; // idempotent
    }

    const scheduleId = await ctx.db.insert("schedules", {
      organizationId: args.organizationId,
      weekStart: args.weekStart,
      weekEnd,
      status: "draft",
      weekStartDay,
      createdAt: now,
      updatedAt: now,
      createdBy: user?._id,
    });

    return scheduleId;
  },
});

/** Assign a question to a specific day in a schedule (drag-and-drop action) */
export const assignQuestion = mutation({
  args: {
    scheduleId: v.id("schedules"),
    dayOfWeek: v.union(
      v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
      v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
    ),
    questionId: v.id("questions"),
  },
  returns: v.id("scheduledQuestions"),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensurePaidOrganizationMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    const user = await findCanonicalUser(ctx, {
      clerkId: (await ctx.auth.getUserIdentity())?.subject,
    });

    const now = Date.now();
    const sqId = await ctx.db.insert("scheduledQuestions", {
      scheduleId: args.scheduleId,
      dayOfWeek: args.dayOfWeek,
      questionId: args.questionId,
      slotOrder: 0,
      assignedAt: now,
      assignedBy: user?._id,
    });

    return sqId;
  },
});

/** Remove a question assignment from a schedule day */
export const unassignQuestion = mutation({
  args: {
    scheduledQuestionId: v.id("scheduledQuestions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sq = await ctx.db.get(args.scheduledQuestionId);
    if (!sq) throw new Error("Assignment not found");

    const schedule = await ctx.db.get(sq.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensurePaidOrganizationMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    await ctx.db.delete(args.scheduledQuestionId);
    return null;
  },
});

/** Publish a schedule — coaches can now see their daily assignments */
export const publishSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensurePaidOrganizationMember(ctx, schedule.organizationId, ["admin", "manager"]);

    await ctx.db.patch(args.scheduleId, {
      status: "published",
      publishedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Auto-schedule: intelligently assign questions to days.
 * This is a mutation because questions should already exist in the pool
 * (generated via generationRuns). It selects from existing questions.
 */
export const autoSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
    axisY: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
    axisYSlugs: v.optional(v.array(v.string())),
    axisX: v.optional(v.union(
      v.literal("style"), v.literal("tone"), v.literal("topic")
    )),
    axisXSlugs: v.optional(v.array(v.string())),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensurePaidOrganizationMember(ctx, schedule.organizationId, ["admin", "manager"]);
    if (schedule.status !== "draft") throw new Error("Cannot modify a published schedule");

    // Build filter based on axis configuration
    const daysOfWeek = getDaysOfWeek(schedule.weekStart, schedule.weekStartDay);
    const now = Date.now();
    const user = await findCanonicalUser(ctx, {
      clerkId: (await ctx.auth.getUserIdentity())?.subject,
    });

    // Collect all public/approved questions that match criteria
    let candidates = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    // Apply axis filters to rank candidates by diversity
    // For simplicity, we shuffle and pick — future: use embeddings for true diversity
    candidates = shuffleArray(candidates);

    // Remove questions already assigned to this schedule
    const existingAssignments = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    const assignedQuestionIds = new Set(
      existingAssignments.map((a) => a.questionId)
    );
    candidates = candidates.filter((q) => !assignedQuestionIds.has(q._id));

    if (candidates.length === 0) {
      throw new Error(
        "No approved questions available. Run a generation or approve existing questions first."
      );
    }

    // Cycle candidates to ensure we have 7+ for the week
    const pool = [...candidates];
    while (pool.length < 7) pool.push(...candidates);
    const selected = pool.sort(() => Math.random() - 0.5).slice(0, 7);

    const assigned: string[] = [];
    for (let i = 0; i < 7; i++) {
      const id = await ctx.db.insert("scheduledQuestions", {
        scheduleId: args.scheduleId,
        dayOfWeek: daysOfWeek[i],
        questionId: selected[i]._id,
        slotOrder: 0,
        assignedAt: now,
        assignedBy: user?._id,
      });
      assigned.push(id);
    }

    // Save axis config to schedule for reproducibility
    await ctx.db.patch(args.scheduleId, {
      axisY: args.axisY,
      axisYSlugs: args.axisYSlugs,
      axisX: args.axisX,
      axisXSlugs: args.axisXSlugs,
      updatedAt: now,
    });

    return Promise.all(assigned);
  },
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const ALL_DAYS_ORDERED: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function computeWeekEnd(weekStart: string, _weekStartDay: "monday" | "sunday"): string {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end.toISOString().slice(0, 10);
}

function getDaysOfWeek(
  _weekStart: string,
  weekStartDay: "monday" | "sunday"
): DayOfWeek[] {
  const startIdx = weekStartDay === "monday" ? 1 : 0;
  const ordered: DayOfWeek[] = [
    ...ALL_DAYS_ORDERED.slice(startIdx),
    ...ALL_DAYS_ORDERED.slice(0, startIdx),
  ].slice(0, 7) as DayOfWeek[];
  return ordered;
}

function getDayOfWeekLabel(date: Date): DayOfWeek {
  return ALL_DAYS_ORDERED[date.getDay()] as DayOfWeek;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
