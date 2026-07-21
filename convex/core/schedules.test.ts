import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import {
  DEFAULT_ORGANIZATION_TIME_ZONE,
  getZonedCalendarDate,
} from "../lib/timezone";

const ADMIN_IDENTITY = {
  subject: "schedule-admin",
  tokenIdentifier: "https://clerk.example|schedule-admin",
  email: "schedule-admin@example.com",
};

const MANAGER_IDENTITY = {
  subject: "schedule-manager",
  tokenIdentifier: "https://clerk.example|schedule-manager",
  email: "schedule-manager@example.com",
};

const MEMBER_IDENTITY = {
  subject: "schedule-member",
  tokenIdentifier: "https://clerk.example|schedule-member",
  email: "schedule-member@example.com",
};

async function createScheduleWorkspace() {
  const t = convexTest(schema, convexFunctionModules);
  const { organizationId, questionIds } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: ADMIN_IDENTITY.subject,
      tokenIdentifier: ADMIN_IDENTITY.tokenIdentifier,
      email: ADMIN_IDENTITY.email,
    });
    const organizationId = await ctx.db.insert("organizations", { name: "Three Day Studio" });
    await ctx.db.insert("organization_members", {
      userId,
      organizationId,
      role: "admin",
    });
    const questionIds = await Promise.all(
      ["Monday question", "Wednesday question", "Friday question"].map((text) =>
        ctx.db.insert("questions", {
          text,
          status: "public",
          totalLikes: 0,
          totalShows: 0,
          averageViewDuration: 0,
        }),
      ),
    );
    return { organizationId, questionIds };
  });

  return {
    t,
    organizationId,
    questionIds,
    admin: t.withIdentity(ADMIN_IDENTITY),
  };
}

async function createAssignedTeamQuestion() {
  const workspace = await createScheduleWorkspace();
  await workspace.t.run(async (ctx) => {
    await ctx.db.patch(workspace.organizationId, {
      planTier: "team",
      billingStatus: "active",
    });
  });
  await workspace.admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId: workspace.organizationId,
    activeDeliveryDays: ["monday"],
  });
  const scheduleId = await workspace.admin.mutation(api.core.schedules.createSchedule, {
    organizationId: workspace.organizationId,
    weekStart: "2026-07-20",
  });
  const result = await workspace.admin.mutation(api.core.teamPrompts.createAndAssign, {
    scheduleId,
    dayOfWeek: "monday",
    questionText: "What assumption should we challenge this week?",
  });
  return { ...workspace, scheduleId, questionId: result.questionId };
}

test("new schedules snapshot their organization's configured delivery days", async () => {
  const { admin, organizationId } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday", "wednesday", "friday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });

  const detail = await admin.query(api.core.schedules.getSchedule, { scheduleId });
  expect(detail.schedule.deliveryDays).toEqual(["monday", "wednesday", "friday"]);
});

test("Team editors can create and assign an organization-private exact question", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, {
      planTier: "team",
      billingStatus: "active",
    });
  });
  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });

  const result = await admin.mutation(api.core.teamPrompts.createAndAssign, {
    scheduleId,
    dayOfWeek: "monday",
    questionText: "  What assumption should we challenge this week?  ",
  });

  const detail = await admin.query(api.core.schedules.getSchedule, { scheduleId });
  expect(detail.assignments).toHaveLength(1);
  expect(detail.assignments[0]?.question.text).toBe("What assumption should we challenge this week?");
  expect(detail.assignments[0]?.assignedBy).toBeDefined();
  expect(result.teamTopicId).toBeUndefined();

  const savedQuestion = await t.run(async (ctx) => ctx.db.get(result.questionId));
  expect(savedQuestion).toMatchObject({
    organizationId,
    customText: "What assumption should we challenge this week?",
    kind: "team_prompt",
    status: "private",
  });
});

test("Team prompts stay out of the creator's personal-question library", async () => {
  const { admin, organizationId } = await createAssignedTeamQuestion();
  const personalQuestions = await admin.query(api.core.questions.getCustomQuestions, { organizationId });
  expect(personalQuestions).toEqual([]);
});

test("ordinary members cannot read draft Team prompt assignments", async () => {
  const { t, organizationId, scheduleId, questionId } = await createAssignedTeamQuestion();
  await t.run(async (ctx) => {
    const memberId = await ctx.db.insert("users", {
      clerkId: MEMBER_IDENTITY.subject,
      tokenIdentifier: MEMBER_IDENTITY.tokenIdentifier,
      email: MEMBER_IDENTITY.email,
    });
    await ctx.db.insert("organization_members", {
      userId: memberId,
      organizationId,
      role: "member",
    });
  });

  const member = t.withIdentity(MEMBER_IDENTITY);
  const detail = await member.query(api.core.schedules.getSchedule, { scheduleId });

  expect(detail.assignments).toEqual([]);
  expect(await member.query(api.core.questions.getQuestionById, { id: questionId })).toBeNull();
  expect(await member.query(api.core.questions.getQuestionsByIds, { ids: [questionId] })).toEqual([]);
});

test("ordinary members cannot read draft Team prompts through the current-week query", async () => {
  const { t, organizationId } = await createScheduleWorkspace();
  const { isoDate, dayOfWeek } = getZonedCalendarDate(
    new Date(),
    DEFAULT_ORGANIZATION_TIME_ZONE,
  );
  await t.run(async (ctx) => {
    const memberId = await ctx.db.insert("users", {
      clerkId: MEMBER_IDENTITY.subject,
      tokenIdentifier: MEMBER_IDENTITY.tokenIdentifier,
      email: MEMBER_IDENTITY.email,
    });
    await ctx.db.insert("organization_members", {
      userId: memberId,
      organizationId,
      role: "member",
    });
    const questionId = await ctx.db.insert("questions", {
      organizationId,
      authorId: memberId,
      customText: "Private draft wording",
      kind: "team_prompt",
      status: "private",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    const now = Date.now();
    const scheduleId = await ctx.db.insert("schedules", {
      organizationId,
      weekStart: isoDate,
      weekEnd: isoDate,
      status: "draft",
      weekStartDay: "monday",
      deliveryDays: [dayOfWeek],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("scheduledQuestions", {
      scheduleId,
      dayOfWeek,
      questionId,
      slotOrder: 0,
      assignedAt: now,
    });
  });

  const current = await t
    .withIdentity(MEMBER_IDENTITY)
    .query(api.core.schedules.getCurrentWeekSchedule, { organizationId });

  expect(current.todayAssignment).toBeUndefined();
});

test("Team prompts cannot be edited through personal-question mutations", async () => {
  const { admin, questionId } = await createAssignedTeamQuestion();
  await expect(admin.mutation(api.core.questions.updatePersonalQuestion, {
    questionId,
    customText: "Changed after scheduling",
    isPublic: false,
  })).rejects.toThrow("schedule-managed Team prompt");
});

test("Team prompts cannot be made public through personal-question mutations", async () => {
  const { admin, questionId } = await createAssignedTeamQuestion();
  await expect(admin.mutation(api.core.questions.makeQuestionPublic, { questionId }))
    .rejects.toThrow("schedule-managed Team prompt");
});

test("Team prompts cannot be deleted through personal-question mutations", async () => {
  const { t, admin, questionId } = await createAssignedTeamQuestion();
  await expect(admin.mutation(api.core.questions.deletePersonalQuestion, { questionId }))
    .rejects.toThrow("schedule-managed Team prompt");
  expect(await t.run(async (ctx) => ctx.db.get(questionId))).not.toBeNull();
});

test("accepting a topic preview saves topic provenance with the exact assignment", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, {
      planTier: "team",
      billingStatus: "trialing",
    });
  });
  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["wednesday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });

  const result = await admin.mutation(api.core.teamPrompts.createAndAssign, {
    scheduleId,
    dayOfWeek: "wednesday",
    questionText: "What concern about launch readiness deserves more airtime?",
    sourceTopic: {
      name: "Launch readiness",
      guidance: "Surface unspoken concerns without turning this into a status meeting.",
      boundaries: "Do not ask people to name individual owners.",
    },
  });

  const detail = await admin.query(api.core.schedules.getSchedule, { scheduleId });
  expect(detail.assignments[0]).toMatchObject({
    teamTopicId: result.teamTopicId,
    teamTopicName: "Launch readiness",
    question: { text: "What concern about launch readiness deserves more airtime?" },
  });

  const topics = await admin.query(api.core.teamPrompts.listTeamTopics, { organizationId });
  expect(topics).toEqual([
    expect.objectContaining({
      _id: result.teamTopicId,
      name: "Launch readiness",
      guidance: "Surface unspoken concerns without turning this into a status meeting.",
      boundaries: "Do not ask people to name individual owners.",
    }),
  ]);
});

test("custom schedule prompts require an active Team workspace", async () => {
  const { admin, organizationId } = await createScheduleWorkspace();
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });

  await expect(admin.mutation(api.core.teamPrompts.createAndAssign, {
    scheduleId,
    dayOfWeek: "monday",
    questionText: "Should this be allowed?",
  })).rejects.toThrow("active Team workspace");
});

test("topic previews reject taxonomy records owned by another organization", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  const { styleId, toneId } = await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, {
      planTier: "team",
      billingStatus: "active",
    });
    const otherOrganizationId = await ctx.db.insert("organizations", {
      name: "Other workspace",
    });
    const styleId = await ctx.db.insert("styles", {
      id: "private-other-style",
      name: "Private other style",
      structure: "Private structure",
      color: "#000000",
      icon: "lock",
      organizationId: otherOrganizationId,
      status: "active",
    });
    const toneId = await ctx.db.insert("tones", {
      id: "global-tone",
      name: "Global tone",
      color: "#ffffff",
      icon: "message-circle",
      promptGuidanceForAI: "Use clear language.",
      status: "active",
    });
    return { styleId, toneId };
  });

  await expect(
    admin.query(internal.core.teamPrompts.authorizeTopicPreview, {
      organizationId,
      styleId,
      toneId,
    }),
  ).rejects.toThrow("Style is not available to this organization");
});

test("topic previews reject unpublished taxonomy records", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  const { styleId, toneId } = await t.run(async (ctx) => {
    await ctx.db.patch(organizationId, { planTier: "team", billingStatus: "active" });
    const styleId = await ctx.db.insert("styles", {
      id: "draft-style",
      name: "Draft style",
      structure: "Draft structure",
      color: "#000000",
      icon: "lock",
      status: "draft",
    });
    const toneId = await ctx.db.insert("tones", {
      id: "global-tone-2",
      name: "Global tone",
      color: "#ffffff",
      icon: "message-circle",
      promptGuidanceForAI: "Use clear language.",
      status: "active",
    });
    return { styleId, toneId };
  });

  await expect(admin.query(internal.core.teamPrompts.authorizeTopicPreview, {
    organizationId,
    styleId,
    toneId,
  })).rejects.toThrow("Style is not available to this organization");
});

test("schedule assignment rejects a private prompt from another organization", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });
  const foreignQuestionId = await t.run(async (ctx) => {
    const foreignOrganizationId = await ctx.db.insert("organizations", { name: "Foreign" });
    return await ctx.db.insert("questions", {
      organizationId: foreignOrganizationId,
      customText: "Foreign private wording",
      kind: "team_prompt",
      status: "private",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
  });

  await expect(admin.mutation(api.core.schedules.assignQuestion, {
    scheduleId,
    dayOfWeek: "monday",
    questionId: foreignQuestionId,
  })).rejects.toThrow("not available to this organization");
});

test("publish rejects a schedule missing configured delivery days", async () => {
  const { admin, organizationId, questionIds } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday", "wednesday", "friday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });
  await admin.mutation(api.core.schedules.assignQuestion, {
    scheduleId,
    dayOfWeek: "monday",
    questionId: questionIds[0],
  });

  await expect(admin.mutation(api.core.schedules.publishSchedule, { scheduleId })).rejects.toThrow(
    "missing delivery days",
  );

  await admin.mutation(api.core.schedules.assignQuestion, {
    scheduleId,
    dayOfWeek: "wednesday",
    questionId: questionIds[1],
  });
  await admin.mutation(api.core.schedules.assignQuestion, {
    scheduleId,
    dayOfWeek: "friday",
    questionId: questionIds[2],
  });
  await admin.mutation(api.core.schedules.publishSchedule, { scheduleId });

  const detail = await admin.query(api.core.schedules.getSchedule, { scheduleId });
  expect(detail.schedule.status).toBe("published");
});

test("auto-schedule assigns only the schedule's configured delivery days", async () => {
  const { admin, organizationId } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["tuesday", "thursday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });
  await admin.mutation(api.core.schedules.autoSchedule, { scheduleId });

  const detail = await admin.query(api.core.schedules.getSchedule, { scheduleId });
  expect(detail.assignments.map((assignment) => assignment.dayOfWeek).sort()).toEqual([
    "thursday",
    "tuesday",
  ]);
});

test("delivery-day setting changes compose instead of overwriting each other", async () => {
  const { admin, organizationId } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday", "wednesday", "friday"],
  });
  await Promise.all([
    admin.mutation(api.core.orgSettings.setDeliveryDayActive, {
      organizationId,
      day: "tuesday",
      active: true,
    }),
    admin.mutation(api.core.orgSettings.setDeliveryDayActive, {
      organizationId,
      day: "wednesday",
      active: false,
    }),
  ]);

  const settings = await admin.query(api.core.orgSettings.getOrgSettings, { organizationId });
  expect(settings.activeDeliveryDays).toEqual(["monday", "tuesday", "friday"]);
});

test("delivery-day settings cannot disable the final active day", async () => {
  const { admin, organizationId } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday"],
  });
  await expect(
    admin.mutation(api.core.orgSettings.setDeliveryDayActive, {
      organizationId,
      day: "monday",
      active: false,
    }),
  ).rejects.toThrow("Select between 1 and 7 delivery days");

  const settings = await admin.query(api.core.orgSettings.getOrgSettings, { organizationId });
  expect(settings.activeDeliveryDays).toEqual(["monday"]);
});

test("assigning a question outside the schedule's delivery days is rejected", async () => {
  const { admin, organizationId, questionIds } = await createScheduleWorkspace();

  await admin.mutation(api.core.orgSettings.upsertOrgSettings, {
    organizationId,
    activeDeliveryDays: ["monday", "wednesday", "friday"],
  });
  const scheduleId = await admin.mutation(api.core.schedules.createSchedule, {
    organizationId,
    weekStart: "2026-07-20",
  });

  await expect(
    admin.mutation(api.core.schedules.assignQuestion, {
      scheduleId,
      dayOfWeek: "tuesday",
      questionId: questionIds[0],
    }),
  ).rejects.toThrow("not an active delivery day");
});

test("coach view ignores legacy assignments outside the schedule's delivery days", async () => {
  const { t, admin, organizationId, questionIds } = await createScheduleWorkspace();
  const { isoDate, dayOfWeek } = getZonedCalendarDate(
    new Date(),
    DEFAULT_ORGANIZATION_TIME_ZONE,
  );
  const inactiveDeliveryDay = dayOfWeek === "monday" ? "tuesday" : "monday";

  await t.run(async (ctx) => {
    const now = Date.now();
    const scheduleId = await ctx.db.insert("schedules", {
      organizationId,
      weekStart: isoDate,
      weekEnd: isoDate,
      status: "published",
      weekStartDay: "monday",
      deliveryDays: [inactiveDeliveryDay],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    });
    await ctx.db.insert("scheduledQuestions", {
      scheduleId,
      dayOfWeek,
      questionId: questionIds[0],
      slotOrder: 0,
      assignedAt: now,
    });
  });

  const current = await admin.query(api.core.schedules.getCurrentWeekSchedule, {
    organizationId,
  });
  expect(current.todayAssignment).toBeUndefined();
});

test("coach daily delivery ignores an assignment outside the schedule's delivery days", async () => {
  const { t, admin, organizationId, questionIds } = await createScheduleWorkspace();
  const { isoDate, dayOfWeek } = getZonedCalendarDate(
    new Date(),
    DEFAULT_ORGANIZATION_TIME_ZONE,
  );
  const inactiveDeliveryDay = dayOfWeek === "monday" ? "tuesday" : "monday";

  await t.run(async (ctx) => {
    const now = Date.now();
    const scheduleId = await ctx.db.insert("schedules", {
      organizationId,
      weekStart: isoDate,
      weekEnd: isoDate,
      status: "published",
      weekStartDay: "monday",
      deliveryDays: [inactiveDeliveryDay],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    });
    await ctx.db.insert("scheduledQuestions", {
      scheduleId,
      dayOfWeek,
      questionId: questionIds[0],
      slotOrder: 0,
      assignedAt: now,
    });
  });

  const current = await admin.query(api.core.coachFeedback.getCoachTodayAssignment, {
    organizationId,
  });
  expect(current.question).toBeUndefined();
});

test("curation preview ranks candidates using attributed coach feedback without assigning them", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  const { historicalQuestionId, intenseCandidateId, scheduledWithoutFeedbackId } = await t.run(async (ctx) => {
    const now = Date.now();
    const historicalQuestionId = await ctx.db.insert("questions", { text: "High-energy opener", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    for (let index = 0; index < 201; index++) {
      await ctx.db.insert("questions", { text: `Filler candidate ${index}`, tone: "calm", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    }
    const intenseCandidateId = await ctx.db.insert("questions", { text: "Another intense opener", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const scheduledWithoutFeedbackId = await ctx.db.insert("questions", { text: "Already scheduled intense opener", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const scheduleId = await ctx.db.insert("schedules", { organizationId, weekStart: "2026-07-06", weekEnd: "2026-07-12", status: "completed", weekStartDay: "monday", deliveryDays: ["monday"], createdAt: now, updatedAt: now });
    const coachId = await ctx.db.insert("users", { clerkId: "second-coach", email: "second-coach@example.com" });
    for (const [index, dayOfWeek] of (["monday", "tuesday", "wednesday"] as const).entries()) {
      const scheduledQuestionId = await ctx.db.insert("scheduledQuestions", {
        scheduleId, dayOfWeek, questionId: historicalQuestionId, slotOrder: index, assignedAt: now,
      });
      await ctx.db.insert("coachFeedback", {
        scheduleId, scheduledQuestionId, questionId: historicalQuestionId, coachId, dayOfWeek,
        wrongVibe: index !== 2, landedWell: true, submittedAt: now,
      });
    }
    await ctx.db.insert("scheduledQuestions", {
      scheduleId, dayOfWeek: "thursday", questionId: scheduledWithoutFeedbackId, slotOrder: 3, assignedAt: now,
    });
    return { historicalQuestionId, intenseCandidateId, scheduledWithoutFeedbackId };
  });

  const preview = await admin.query(api.core.coachFeedback.getCurationPreview, {
    organizationId,
    currentDate: "2026-07-18",
    limit: 20,
  });

  expect(preview.totalResponses).toBe(3);
  expect(preview.coachCount).toBe(1);
  expect(preview.confidence).toBe("insufficient");
  expect(preview.recommendations.find((candidate) => candidate.questionId === intenseCandidateId)?.reasons).toContainEqual({
    dimension: "tone", value: "intense", score: 1 / 3, responses: 3,
    landedWell: 3, fellFlat: 0, wrongVibe: 2, timingOff: 0, isMixed: true, coachCount: 1,
  });
  expect(preview.recommendations.findIndex((candidate) => candidate.questionId === intenseCandidateId)).toBe(0);
  expect(preview.recommendations.some((candidate) => candidate.questionId === historicalQuestionId)).toBe(false);
  expect(preview.recommendations.some((candidate) => candidate.questionId === scheduledWithoutFeedbackId)).toBe(false);
  expect(preview.recommendations.every((candidate) => candidate.reasons.length > 0)).toBe(true);
});

test("managers can read the curation preview used by the scheduler", async () => {
  const { t, organizationId } = await createScheduleWorkspace();
  await t.run(async (ctx) => {
    const managerId = await ctx.db.insert("users", {
      clerkId: MANAGER_IDENTITY.subject,
      tokenIdentifier: MANAGER_IDENTITY.tokenIdentifier,
      email: MANAGER_IDENTITY.email,
    });
    await ctx.db.insert("organization_members", {
      userId: managerId,
      organizationId,
      role: "manager",
    });
  });

  const preview = await t.withIdentity(MANAGER_IDENTITY).query(
    api.core.coachFeedback.getCurationPreview,
    { organizationId, currentDate: "2026-07-18" },
  );

  expect(preview.totalResponses).toBe(0);
});

test("curation preview uses recent schedule feedback after the organization exceeds 100 schedules", async () => {
  const { t, admin, organizationId } = await createScheduleWorkspace();
  const newestCandidateId = await t.run(async (ctx) => {
    const now = Date.now();
    const oldQuestionId = await ctx.db.insert("questions", { text: "Old intense question", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const newQuestionId = await ctx.db.insert("questions", { text: "New intense question", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const newestCandidateId = await ctx.db.insert("questions", { text: "Fresh intense candidate", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const coachId = await ctx.db.insert("users", { clerkId: "history-coach", email: "history-coach@example.com" });

    for (let index = 0; index < 101; index++) {
      const start = new Date(Date.UTC(2024, 0, 1 + index * 7));
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      const scheduleId = await ctx.db.insert("schedules", {
        organizationId,
        weekStart: start.toISOString().slice(0, 10),
        weekEnd: end.toISOString().slice(0, 10),
        status: "published",
        weekStartDay: "monday",
        deliveryDays: ["monday"],
        createdAt: now + index,
        updatedAt: now + index,
      });
      if (index === 0 || index === 100) {
        const questionId = index === 0 ? oldQuestionId : newQuestionId;
        const scheduledQuestionId = await ctx.db.insert("scheduledQuestions", {
          scheduleId,
          dayOfWeek: "monday",
          questionId,
          slotOrder: 0,
          assignedAt: now + index,
        });
        await ctx.db.insert("coachFeedback", {
          scheduleId,
          scheduledQuestionId,
          questionId,
          coachId,
          dayOfWeek: "monday",
          landedWell: index === 100,
          wrongVibe: index === 0,
          submittedAt: now + index,
        });
      }
    }
    return newestCandidateId;
  });

  const preview = await admin.query(api.core.coachFeedback.getCurationPreview, {
    organizationId,
    currentDate: "2026-07-18",
    limit: 20,
  });

  expect(preview.totalResponses).toBe(1);
  expect(preview.recommendations.find((candidate) => candidate.questionId === newestCandidateId)?.score).toBe(1);
});

test("coach feedback accepts only today's assignment from a published schedule", async () => {
  const { t, admin, organizationId, questionIds } = await createScheduleWorkspace();
  const { isoDate, dayOfWeek } = getZonedCalendarDate(new Date(), DEFAULT_ORGANIZATION_TIME_ZONE);
  const { draftAssignmentId, futureAssignmentId, currentAssignmentId } = await t.run(async (ctx) => {
    const now = Date.now();
    const insertAssignment = async (
      status: "draft" | "published",
      weekStart: string,
      weekEnd: string,
    ) => {
      const scheduleId = await ctx.db.insert("schedules", {
        organizationId,
        weekStart,
        weekEnd,
        status,
        weekStartDay: "monday",
        deliveryDays: [dayOfWeek],
        createdAt: now,
        updatedAt: now,
        publishedAt: status === "published" ? now : undefined,
      });
      return ctx.db.insert("scheduledQuestions", {
        scheduleId,
        dayOfWeek,
        questionId: questionIds[0],
        slotOrder: 0,
        assignedAt: now,
      });
    };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureIso = tomorrow.toISOString().slice(0, 10);
    return {
      draftAssignmentId: await insertAssignment("draft", isoDate, isoDate),
      futureAssignmentId: await insertAssignment("published", futureIso, futureIso),
      currentAssignmentId: await insertAssignment("published", isoDate, isoDate),
    };
  });

  await expect(admin.mutation(api.core.coachFeedback.submitCoachFeedback, {
    scheduledQuestionId: draftAssignmentId,
    landedWell: true,
  })).rejects.toThrow("published schedule");
  await expect(admin.mutation(api.core.coachFeedback.submitCoachFeedback, {
    scheduledQuestionId: futureAssignmentId,
    landedWell: true,
  })).rejects.toThrow("today's assignment");
  await expect(admin.mutation(api.core.coachFeedback.submitCoachFeedback, {
    scheduledQuestionId: currentAssignmentId,
    landedWell: true,
  })).resolves.toBeNull();
});
