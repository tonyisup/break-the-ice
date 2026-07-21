import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { ensurePaidOrganizationMember } from "../auth";
import { findCanonicalUser } from "../lib/users";
import { deliveryDaysForSchedule } from "../lib/deliveryDays";
import { MAX_TEAM_PROMPT_TEXT_LENGTH } from "../lib/teamPromptContract";

const MAX_TOPIC_NAME_LENGTH = 100;
const MAX_TOPIC_GUIDANCE_LENGTH = 1000;
const MAX_TOPIC_BOUNDARIES_LENGTH = 1000;
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

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

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
      throw new Error("Style is not available to this organization.");
    }
    if (
      !tone ||
      (tone.status !== undefined && tone.status !== "active") ||
      (tone.organizationId && tone.organizationId !== args.organizationId)
    ) {
      throw new Error("Tone is not available to this organization.");
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
    if (!schedule) throw new Error("Schedule not found");
    await ensurePaidOrganizationMember(ctx, schedule.organizationId, [
      "admin",
      "manager",
    ]);
    if (schedule.status !== "draft")
      throw new Error("Cannot modify a published schedule");
    if (!deliveryDaysForSchedule(schedule).includes(args.dayOfWeek)) {
      throw new Error(
        `${args.dayOfWeek} is not an active delivery day for this schedule`,
      );
    }

    const identity = await ctx.auth.getUserIdentity();
    const user = await findCanonicalUser(ctx, {
      clerkId: identity?.subject,
      tokenIdentifier: identity?.tokenIdentifier,
      email: identity?.email,
    });
    if (!user) throw new Error("User not found");

    const questionText = requiredText(
      args.questionText,
      "Question",
      MAX_TEAM_PROMPT_TEXT_LENGTH,
    );
    const now = Date.now();
    let teamTopicId = undefined;
    if (args.sourceTopic) {
      teamTopicId = await ctx.db.insert("teamTopics", {
        organizationId: schedule.organizationId,
        name: requiredText(
          args.sourceTopic.name,
          "Topic name",
          MAX_TOPIC_NAME_LENGTH,
        ),
        guidance: requiredText(
          args.sourceTopic.guidance,
          "Topic guidance",
          MAX_TOPIC_GUIDANCE_LENGTH,
        ),
        boundaries: optionalText(
          args.sourceTopic.boundaries,
          "Topic boundaries",
          MAX_TOPIC_BOUNDARIES_LENGTH,
        ),
        createdBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    const questionId = await ctx.db.insert("questions", {
      organizationId: schedule.organizationId,
      authorId: user._id,
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
      assignedBy: user._id,
      teamTopicId,
      questionTextSnapshot: questionText,
    });
    await ctx.db.patch(schedule._id, { updatedAt: now });

    return { questionId, scheduledQuestionId, teamTopicId };
  },
});
