import { v } from "convex/values";
import { type GenericId } from "convex/values";
import { mutation, query } from "../_generated/server";
import { ensureOrgMember } from "../auth";
import { findCanonicalUser } from "../lib/users";
import {
  DEFAULT_ORGANIZATION_TIME_ZONE,
  getZonedCalendarDate,
} from "../lib/timezone";
import { deliveryDaysForSchedule } from "../lib/deliveryDays";

const MAX_FEEDBACK_PER_SCHEDULE = 10000;

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const ALL_DAYS: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
];

// ──────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────

/** Coach's view: "What question do I have today?" */
export const getCoachTodayAssignment = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.object({
    scheduledQuestionId: v.optional(v.id("scheduledQuestions")),
    scheduleId: v.optional(v.id("schedules")),
    question: v.optional(v.object({
      _id: v.id("questions"),
      text: v.optional(v.string()),
      style: v.optional(v.string()),
      tone: v.optional(v.string()),
      topic: v.optional(v.string()),
    })),
    dayOfWeek: v.optional(v.union(
      v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
      v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
    )),
    hasSubmittedFeedback: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });
    if (!user) throw new Error("User not found");

    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    const { isoDate: todayIso, dayOfWeek: dayLabel } = getZonedCalendarDate(
      new Date(),
      settings?.timeZone ?? DEFAULT_ORGANIZATION_TIME_ZONE,
    );

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_organizationId_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "published")
      )
      .filter((q) =>
        q.and(
          q.lte(q.field("weekStart"), todayIso),
          q.gte(q.field("weekEnd"), todayIso)
        )
      )
      .unique();

    if (!schedule) {
      return {
        scheduledQuestionId: undefined,
        scheduleId: undefined,
        question: undefined,
        dayOfWeek: dayLabel,
        hasSubmittedFeedback: false,
      };
    }

    if (!deliveryDaysForSchedule(schedule).includes(dayLabel)) {
      return {
        scheduledQuestionId: undefined,
        scheduleId: schedule._id,
        question: undefined,
        dayOfWeek: dayLabel,
        hasSubmittedFeedback: false,
      };
    }

    const sq = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule_day", (q) =>
        q.eq("scheduleId", schedule._id).eq("dayOfWeek", dayLabel)
      )
      .first();

    if (!sq) {
      return {
        scheduledQuestionId: undefined,
        scheduleId: schedule._id,
        question: undefined,
        dayOfWeek: dayLabel,
        hasSubmittedFeedback: false,
      };
    }

    const question = await ctx.db.get(sq.questionId);

    const existingFeedback = await ctx.db
      .query("coachFeedback")
      .withIndex("by_coach_schedule_question_day", (q) =>
        q
          .eq("coachId", user._id)
          .eq("scheduleId", schedule._id)
          .eq("questionId", sq.questionId)
          .eq("dayOfWeek", dayLabel)
      )
      .unique();

    return {
      scheduledQuestionId: sq._id,
      scheduleId: schedule._id,
      question: question ? {
        _id: question._id,
        text: question.text ?? question.customText,
        style: question.style,
        tone: question.tone,
        topic: question.topic,
      } : undefined,
      dayOfWeek: dayLabel,
      hasSubmittedFeedback: !!existingFeedback,
    };
  },
});

/** Admin view: aggregated weekly feedback report */
export const getWeeklyFeedbackReport = query({
  args: {
    scheduleId: v.id("schedules"),
  },
  returns: v.object({
    summary: v.object({
      totalResponses: v.number(),
      totalCoaches: v.number(),
      landedWellPct: v.number(),
      fellFlatPct: v.number(),
      wrongVibePct: v.number(),
      timingOffPct: v.number(),
    }),
    byDay: v.array(v.object({
      dayOfWeek: v.union(
        v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
        v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
      ),
      questionId: v.optional(v.id("questions")),
      questionText: v.optional(v.string()),
      totalResponses: v.number(),
      landedWellPct: v.number(),
      fellFlatPct: v.number(),
      coachesResponded: v.array(v.string()),
    })),
    allNotes: v.array(v.object({
      dayOfWeek: v.union(
        v.literal("monday"), v.literal("tuesday"), v.literal("wednesday"),
        v.literal("thursday"), v.literal("friday"), v.literal("saturday"), v.literal("sunday")
      ),
      coachId: v.id("users"),
      questionText: v.optional(v.string()),
      notes: v.string(),
    })),
  }),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId, "admin");

    const feedbacks = await ctx.db
      .query("coachFeedback")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .take(MAX_FEEDBACK_PER_SCHEDULE);

    const sqMap = new Map<string, GenericId<"questions"> | undefined>();
    for (const day of ALL_DAYS) {
      const sq = await ctx.db
        .query("scheduledQuestions")
        .withIndex("by_schedule_day", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("dayOfWeek", day)
        )
        .first();
      if (sq) sqMap.set(day, sq.questionId);
    }

    // Aggregate totals
    let totalResponses = 0;
    let landedWell = 0, fellFlat = 0, wrongVibe = 0, timingOff = 0;
    const uniqueCoaches = new Set<string>();
    const coachesByDay = new Map<string, Set<string>>();

    for (const f of feedbacks) {
      totalResponses++;
      uniqueCoaches.add(f.coachId);
      if (f.landedWell) landedWell++;
      if (f.fellFlat) fellFlat++;
      if (f.wrongVibe) wrongVibe++;
      if (f.timingOff) timingOff++;

      if (!coachesByDay.has(f.dayOfWeek)) {
        coachesByDay.set(f.dayOfWeek, new Set());
      }
      coachesByDay.get(f.dayOfWeek)!.add(f.coachId);
    }

    // Build question text cache in one pass
    const questionTextCache = new Map<GenericId<"questions">, string | undefined>();
    const allQuestionIds = new Set(Object.values(sqMap).filter(Boolean) as GenericId<"questions">[]);
    for (const qid of allQuestionIds) {
      const q = await ctx.db.get(qid);
      questionTextCache.set(qid, q?.text ?? q?.customText);
    }

    const byDay = ALL_DAYS.map(day => {
      const dayFeedbacks = feedbacks.filter(f => f.dayOfWeek === day);
      const qId = sqMap.get(day);
      const dayLanded = dayFeedbacks.filter(f => f.landedWell).length;
      const dayFlat = dayFeedbacks.filter(f => f.fellFlat).length;
      const total = dayFeedbacks.length;
      return {
        dayOfWeek: day,
        questionId: qId,
        questionText: qId ? questionTextCache.get(qId as GenericId<"questions">) : undefined,
        totalResponses: total,
        landedWellPct: total ? (dayLanded / total) * 100 : 0,
        fellFlatPct: total ? (dayFlat / total) * 100 : 0,
        coachesResponded: [...(coachesByDay.get(day) ?? [])],
      };
    });

    const allNotes = feedbacks
      .filter(f => f.notes)
      .map(f => ({
        dayOfWeek: f.dayOfWeek as DayOfWeek,
        coachId: f.coachId,
        questionText: questionTextCache.get(f.questionId),
        notes: f.notes!,
      }));

    return {
      summary: {
        totalResponses,
        totalCoaches: uniqueCoaches.size,
        landedWellPct: totalResponses ? (landedWell / totalResponses) * 100 : 0,
        fellFlatPct: totalResponses ? (fellFlat / totalResponses) * 100 : 0,
        wrongVibePct: totalResponses ? (wrongVibe / totalResponses) * 100 : 0,
        timingOffPct: totalResponses ? (timingOff / totalResponses) * 100 : 0,
      },
      byDay,
      allNotes,
    };
  },
});

/**
 * Explainable, read-only candidate ranking for next-week curation.
 * It never writes schedules or assignments; each score is attributable to historical coach feedback.
 */
export const getCurationPreview = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ensureOrgMember(ctx, args.organizationId, "admin");
    const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(100);

    const feedbacks = (
      await Promise.all(
        schedules.map((schedule) =>
          ctx.db.query("coachFeedback").withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id)).take(MAX_FEEDBACK_PER_SCHEDULE),
        ),
      )
    ).flat();
    const signalByDimension = new Map<string, { score: number; responses: number; landedWell: number; fellFlat: number; wrongVibe: number; timingOff: number }>();
    const historicalQuestionIds = new Set<string>();

    for (const feedback of feedbacks) {
      historicalQuestionIds.add(feedback.questionId);
      const question = await ctx.db.get(feedback.questionId);
      if (!question) continue;
      const score = (feedback.landedWell ? 1 : 0) - (feedback.fellFlat ? 1 : 0) - (feedback.wrongVibe ? 1 : 0) - (feedback.timingOff ? 0.5 : 0);
      for (const [dimension, value] of [["style", question.style], ["tone", question.tone], ["topic", question.topic]] as const) {
        if (!value) continue;
        const key = `${dimension}:${value}`;
        const current: { score: number; responses: number; landedWell: number; fellFlat: number; wrongVibe: number; timingOff: number } = signalByDimension.get(key) ?? { score: 0, responses: 0, landedWell: 0, fellFlat: 0, wrongVibe: 0, timingOff: 0 };
        current.score += score;
        current.responses += 1;
        if (feedback.landedWell) current.landedWell += 1;
        if (feedback.fellFlat) current.fellFlat += 1;
        if (feedback.wrongVibe) current.wrongVibe += 1;
        if (feedback.timingOff) current.timingOff += 1;
        signalByDimension.set(key, current);
      }
    }

    const candidates = await ctx.db
      .query("questions")
      .withIndex("by_status", (q) => q.eq("status", "public"))
      .take(200);
    const recommendations = candidates
      .filter((question) => !historicalQuestionIds.has(question._id))
      .map((question) => {
        const reasons = (["style", "tone", "topic"] as const).flatMap((dimension) => {
          const value = question[dimension];
          if (!value) return [];
          const signal = signalByDimension.get(`${dimension}:${value}`);
          if (!signal) return [];
          return [{ dimension, value, score: signal.score / signal.responses, responses: signal.responses, landedWell: signal.landedWell, fellFlat: signal.fellFlat, wrongVibe: signal.wrongVibe, timingOff: signal.timingOff }];
        });
        return {
          questionId: question._id,
          text: question.text ?? question.customText,
          score: reasons.reduce((total, reason) => total + reason.score, 0),
          reasons,
        };
      })
      .sort((left, right) => right.score - left.score || String(left.questionId).localeCompare(String(right.questionId)))
      .slice(0, limit);

    return {
      totalResponses: feedbacks.length,
      confidence: feedbacks.length >= 3 ? "directional" as const : "insufficient" as const,
      recommendations,
    };
  },
});

// ──────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────

/** Coach submits feedback on their assigned QOTD */
export const submitCoachFeedback = mutation({
  args: {
    scheduledQuestionId: v.id("scheduledQuestions"),
    landedWell: v.optional(v.boolean()),
    fellFlat: v.optional(v.boolean()),
    wrongVibe: v.optional(v.boolean()),
    timingOff: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await findCanonicalUser(ctx, {
      clerkId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
    });
    if (!user) throw new Error("User not found");

    const sq = await ctx.db.get(args.scheduledQuestionId);
    if (!sq) throw new Error("Scheduled question not found");

    const schedule = await ctx.db.get(sq.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await ensureOrgMember(ctx, schedule.organizationId);

    // Check if coach already submitted for this schedule+question+day combo
    const existing = await ctx.db
      .query("coachFeedback")
      .withIndex("by_coach_schedule_question_day", (q) =>
        q
          .eq("coachId", user._id)
          .eq("scheduleId", sq.scheduleId)
          .eq("questionId", sq.questionId)
          .eq("dayOfWeek", sq.dayOfWeek)
      )
      .unique();

    if (existing) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        landedWell: args.landedWell,
        fellFlat: args.fellFlat,
        wrongVibe: args.wrongVibe,
        timingOff: args.timingOff,
        notes: args.notes,
        submittedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("coachFeedback", {
        scheduleId: sq.scheduleId,
        scheduledQuestionId: sq._id,
        questionId: sq.questionId,
        coachId: user._id,
        dayOfWeek: sq.dayOfWeek,
        landedWell: args.landedWell,
        fellFlat: args.fellFlat,
        wrongVibe: args.wrongVibe,
        timingOff: args.timingOff,
        notes: args.notes,
        submittedAt: Date.now(),
      });
    }

    return null;
  },
});
