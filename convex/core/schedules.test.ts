import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "../_generated/api";
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
  const { historicalQuestionId, intenseCandidateId, neutralCandidateId } = await t.run(async (ctx) => {
    const now = Date.now();
    const historicalQuestionId = await ctx.db.insert("questions", { text: "High-energy opener", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const intenseCandidateId = await ctx.db.insert("questions", { text: "Another intense opener", tone: "intense", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const neutralCandidateId = await ctx.db.insert("questions", { text: "Calm conversation starter", tone: "calm", status: "public", totalLikes: 0, totalShows: 0, averageViewDuration: 0 });
    const scheduleId = await ctx.db.insert("schedules", { organizationId, weekStart: "2026-07-06", weekEnd: "2026-07-12", status: "completed", weekStartDay: "monday", deliveryDays: ["monday"], createdAt: now, updatedAt: now });
    const scheduledQuestionId = await ctx.db.insert("scheduledQuestions", { scheduleId, dayOfWeek: "monday", questionId: historicalQuestionId, slotOrder: 0, assignedAt: now });
    const coachId = await ctx.db.insert("users", { clerkId: "second-coach", email: "second-coach@example.com" });
    for (const id of ["first", "second", "third"]) {
      const feedbackCoachId = id === "first" ? coachId : await ctx.db.insert("users", { clerkId: `coach-${id}`, email: `coach-${id}@example.com` });
      await ctx.db.insert("coachFeedback", { scheduleId, scheduledQuestionId, questionId: historicalQuestionId, coachId: feedbackCoachId, dayOfWeek: "monday", wrongVibe: true, submittedAt: now });
    }
    return { historicalQuestionId, intenseCandidateId, neutralCandidateId };
  });

  const preview = await admin.query(api.core.coachFeedback.getCurationPreview, { organizationId, limit: 20 });

  expect(preview.totalResponses).toBe(3);
  expect(preview.recommendations.find((candidate) => candidate.questionId === intenseCandidateId)?.reasons).toContainEqual({
    dimension: "tone", value: "intense", score: -1, responses: 3,
    landedWell: 0, fellFlat: 0, wrongVibe: 3, timingOff: 0,
  });
  expect(preview.recommendations.findIndex((candidate) => candidate.questionId === neutralCandidateId)).toBeLessThan(
    preview.recommendations.findIndex((candidate) => candidate.questionId === intenseCandidateId),
  );
  expect(preview.recommendations.some((candidate) => candidate.questionId === historicalQuestionId)).toBe(false);
});
