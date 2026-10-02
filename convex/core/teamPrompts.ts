import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { ensurePaidOrganizationMember } from "../auth";
import { deliveryDaysForSchedule } from "../lib/deliveryDays";
import { requireQuestionText } from "../lib/questionText";
import {
  optionalTeamTopicText,
  requireTeamTopicText,
} from "../lib/teamPromptContract";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";

const TEAM_TOPIC_LIST_LIMIT = 200;

const dayValidator = v.union(
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday"),
  v.literal("sunday"),
);

export const authorizeTopicPreview = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    styleId: v.id("styles"),
    toneId: v.id("tones"),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const membership = await ensurePaidOrganizationMember(
      ctx,
      args.organizationId,
      ["admin", "manager"],
    );
    const [style, tone] = await Promise.all([
      ctx.db.get(args.styleId),
      ctx.db.get(args.toneId),
    ]);
    if (
      !style ||
      (style.status !== undefined && style.status !== "active") ||
      (style.organizationId && style.organizationId !== args.organizationId)
    ) {
      throw new ConvexError({
        code: ERROR_CODES.STYLE_UNAVAILABLE,
        message: ERROR_MESSAGES.STYLE_UNAVAILABLE,
      });
    }
    if (
      !tone ||
      (tone.status !== undefined && tone.status !== "active") ||
      (tone.organizationId && tone.organizationId !== args.organizationId)
    ) {
      throw new ConvexError({
        code: ERROR_CODES.TONE_UNAVAILABLE,
        message: ERROR_MESSAGES.TONE_UNAVAILABLE,
      });
    }
    return membership.userId;
  },
});

export const listTeamTopics = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(
    v.object({
      _id: v.id("teamTopics"),
      name: v.string(),
      guidance: v.string(),
      boundaries: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await ensurePaidOrganizationMember(ctx, args.organizationId);
    const topics = await ctx.db
      .query("teamTopics")
      .withIndex("by_organizationId_and_updatedAt", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(TEAM_TOPIC_LIST_LIMIT);
    return topics.map((topic) => ({
      _id: topic._id,
      name: topic.name,
      guidance: topic.guidance,
      boundaries: topic.boundaries,
      updatedAt: topic.updatedAt,
    }));
  },
});

export const createAndAssign = mutation({
  args: {
    scheduleId: v.id("schedules"),
    dayOfWeek: dayValidator,
    questionText: v.string(),
    sourceTopic: v.optional(
      v.object({
        name: v.string(),
        guidance: v.string(),
        boundaries: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    questionId: v.id("questions"),
    scheduledQuestionId: v.id("scheduledQuestions"),
    teamTopicId: v.optional(v.id("teamTopics")),
  }),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    // Checked before membership, so it stays a plain error like the other schedule paths.
    if (!schedule) throw new Error("Schedule not found");
    // Writes are credited to the membership row that passed the role check.
    const membership = await ensurePaidOrganizationMember(
      ctx,
      schedule.organizationId,
      ["admin", "manager"],
    );
    if (schedule.status !== "draft") {
      throw new ConvexError({
        code: ERROR_CODES.SCHEDULE_NOT_DRAFT,
        message: ERROR_MESSAGES.SCHEDULE_NOT_DRAFT,
      });
    }
    if (!deliveryDaysForSchedule(schedule).includes(args.dayOfWeek)) {
      throw new ConvexError({
        code: ERROR_CODES.SCHEDULE_DAY_INACTIVE,
        message: ERROR_MESSAGES.SCHEDULE_DAY_INACTIVE,
      });
    }

    const questionText = requireQuestionText(args.questionText);
    const now = Date.now();
    let teamTopicId = undefined;
    if (args.sourceTopic) {
      teamTopicId = await ctx.db.insert("teamTopics", {
        organizationId: schedule.organizationId,
        name: requireTeamTopicText(args.sourceTopic.name, "name"),
        guidance: requireTeamTopicText(args.sourceTopic.guidance, "guidance"),
        boundaries: optionalTeamTopicText(
          args.sourceTopic.boundaries,
          "boundaries",
        ),
        createdBy: membership.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const questionId = await ctx.db.insert("questions", {
      organizationId: schedule.organizationId,
      authorId: membership.userId,
      customText: questionText,
      kind: "team_prompt",
      status: "private",
      totalLikes: 0,
      totalThumbsDown: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });

    const existing = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_schedule_day", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("dayOfWeek", args.dayOfWeek),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);

    const scheduledQuestionId = await ctx.db.insert("scheduledQuestions", {
      scheduleId: args.scheduleId,
      dayOfWeek: args.dayOfWeek,
      questionId,
      slotOrder: 0,
      assignedAt: now,
      assignedBy: membership.userId,
      teamTopicId,
      questionTextSnapshot: questionText,
    });
    await ctx.db.patch(schedule._id, { updatedAt: now });

    return { questionId, scheduledQuestionId, teamTopicId };
  },
});
