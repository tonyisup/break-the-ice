/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const OWNER = { subject: "owner-clerk", tokenIdentifier: "test|owner-clerk", email: "owner@example.com" };
const OTHER = { subject: "other-clerk", tokenIdentifier: "test|other-clerk", email: "other@example.com" };

const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
// A plausible view time: the history merge skips timestamps that can't be real.
const T0 = Date.UTC(2026, 0, 1);

// Some mutations schedule a background embedding refresh; keep it from firing after a test ends.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: OWNER.email, clerkId: OWNER.subject });
    const otherId = await ctx.db.insert("users", { email: OTHER.email, clerkId: OTHER.subject });
    const privateQuestionId = await ctx.db.insert("questions", {
      authorId: ownerId,
      customText: "What is my private question?",
      status: "private",
      ...counters,
    });
    const publicQuestionId = await ctx.db.insert("questions", {
      text: "What is a public question?",
      status: "public",
      ...counters,
    });
    return { ownerId, otherId, privateQuestionId, publicQuestionId };
  });
  return { t, ...ids };
}

async function likedRelations(t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("userQuestions").collect()).filter(
      (row) => row.userId === userId && row.status === "liked",
    ),
  );
}

describe("private questions stay private", () => {
  test("merging likes skips another user's private question and bad ids", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [privateQuestionId, publicQuestionId, "not-a-real-id"],
    });

    const liked = await likedRelations(t, otherId);
    expect(liked.map((row) => row.questionId)).toEqual([publicQuestionId]);
  });

  test("setting the liked list skips another user's private question", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateLikedQuestions, {
      likedQuestions: [privateQuestionId, publicQuestionId],
    });

    const liked = await likedRelations(t, otherId);
    expect(liked.map((row) => row.questionId)).toEqual([publicQuestionId]);
  });

  test("the liked list never returns a private question, even with a stored like", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      for (const questionId of [privateQuestionId, publicQuestionId]) {
        await ctx.db.insert("userQuestions", { userId: otherId, questionId, status: "liked", updatedAt: Date.now() });
      }
    });

    const liked = await t.withIdentity(OTHER).query(api.core.questions.getLikedQuestions, {});
    expect(liked.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([publicQuestionId]);
  });

  test("the owner still sees their own private question in likes and history", async () => {
    const { t, privateQuestionId } = await setup();

    await t.withIdentity(OWNER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [privateQuestionId],
    });
    await t.withIdentity(OWNER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [{ questionId: privateQuestionId, viewedAt: T0 + 1_000 }],
    });

    const liked = await t.withIdentity(OWNER).query(api.core.questions.getLikedQuestions, {});
    expect(liked.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([privateQuestionId]);
    const history = await t.withIdentity(OWNER).query(api.core.userSettings.getQuestionHistory, {});
    expect(history.map((entry: { question: { _id: Id<"questions"> } }) => entry.question._id)).toEqual([privateQuestionId]);
  });

  test("history never returns another user's private question", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      for (const questionId of [privateQuestionId, publicQuestionId]) {
        await ctx.db.insert("userQuestions", { userId: otherId, questionId, status: "seen", updatedAt: Date.now() });
      }
    });

    const history = await t.withIdentity(OTHER).query(api.core.userSettings.getQuestionHistory, {});
    expect(history.map((entry: { question: { _id: Id<"questions"> } }) => entry.question._id)).toEqual([publicQuestionId]);
  });

  test("an analytics event on another user's private question is ignored", async () => {
    const { t, otherId, privateQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
      questionId: privateQuestionId,
      event: "liked",
      viewDuration: 0,
    });

    expect(await likedRelations(t, otherId)).toEqual([]);
    const question = await t.run(async (ctx) => await ctx.db.get(privateQuestionId));
    expect(question?.totalLikes).toBe(0);
    expect(question?.totalShows).toBe(0);
  });

  test("remix refuses another user's private question", async () => {
    const { t, privateQuestionId } = await setup();

    await expect(
      t.withIdentity(OTHER).action(api.core.questions.remixQuestionForUser, { questionId: privateQuestionId }),
    ).rejects.toThrow("Question not found.");
  });
});

describe("analytics can't be inflated", () => {
  test("a signed-in user's repeated likes count once", async () => {
    const { t, publicQuestionId } = await setup();
    const like = () =>
      t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
      });

    await like();
    await like();
    await like();

    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(1);
  });

  test("a signed-in like still counts when the liked list is saved first, as the client does", async () => {
    const { t, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateLikedQuestions, {
      likedQuestions: [publicQuestionId],
    });
    await t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "liked",
      viewDuration: 0,
    });

    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(1);
  });

  test("anonymous likes count once per session and not at all without one", async () => {
    const { t, publicQuestionId } = await setup();
    const like = (sessionId?: string) =>
      t.mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
        sessionId,
      });

    await like("session-a");
    await like("session-a");
    await like("session-b");
    await like(undefined);

    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(2);
  });

  test("repeat likes don't add like events either, since the admin like count reads them", async () => {
    const { t, publicQuestionId } = await setup();
    const like = (signedIn: boolean, sessionId?: string) =>
      (signedIn ? t.withIdentity(OTHER) : t).mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
        sessionId,
      });

    await like(true);
    await like(true);
    await like(false, "session-a");
    await like(false, "session-a");
    await like(false);

    const likeEvents = await t.run(async (ctx) =>
      (await ctx.db.query("analytics").collect()).filter((row) => row.event === "liked"),
    );
    expect(likeEvents).toHaveLength(2);
    // Uncounted likes don't add shows either, or likes-per-show would drift toward pruning.
    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalShows).toBe(2);
  });

  test("signed-in events don't store the device session id", async () => {
    const { t, publicQuestionId } = await setup();
    const like = (signedIn: boolean) =>
      (signedIn ? t.withIdentity(OTHER) : t).mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
        sessionId: "shared-device",
      });

    await like(true);
    // Someone else, signed out on the same device, is not tied to that account's like.
    await like(false);

    const events = await t.run(async (ctx) => await ctx.db.query("analytics").collect());
    expect(events.map((row) => row.sessionId)).toEqual([undefined, "shared-device"]);
    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(2);
  });

  test("an oversized session id is ignored, so it can't be stored or used to count a like", async () => {
    const { t, publicQuestionId } = await setup();

    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "seen",
      viewDuration: 0,
      sessionId: "x".repeat(10_000),
    });
    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "liked",
      viewDuration: 0,
      sessionId: "y".repeat(10_000),
    });

    const events = await t.run(async (ctx) => await ctx.db.query("analytics").collect());
    expect(events.map((row) => [row.event, row.sessionId])).toEqual([["seen", undefined]]);
    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(0);
  });

  test("anonymous likes on a question are capped per hour, whatever the session id", async () => {
    const { t, publicQuestionId } = await setup();
    const anonymousLike = (sessionId: string) =>
      t.mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
        sessionId,
      });

    // A fresh session id per like gets past the per-session check; the cap (20 an hour) still holds.
    for (let i = 0; i < 25; i++) await anonymousLike(`session-${i}`);
    let question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(20);

    // Signed-in likes are unaffected.
    await t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "liked",
      viewDuration: 0,
    });
    question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(21);
  });

  test("anonymous likes older than the window don't count toward the cap", async () => {
    const { t, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert("analytics", {
          questionId: publicQuestionId,
          event: "liked",
          viewDuration: 0,
          timestamp: twoHoursAgo,
          sessionId: `old-session-${i}`,
        });
      }
    });

    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "liked",
      viewDuration: 0,
      sessionId: "new-session",
    });

    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalLikes).toBe(1);
  });

  test("view durations are bounded", async () => {
    const { t, publicQuestionId } = await setup();

    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "seen",
      viewDuration: 1e12,
    });
    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "seen",
      viewDuration: -5_000,
    });

    const question = await t.run(async (ctx) => await ctx.db.get(publicQuestionId));
    expect(question?.totalShows).toBe(2);
    expect(question?.averageViewDuration).toBe(5 * 60 * 1000);
  });
});

describe("sign-in history merge is safe to retry", () => {
  test("sending the same history twice records each view once", async () => {
    const { t, otherId, publicQuestionId } = await setup();
    const history = [
      { questionId: publicQuestionId, viewedAt: T0 + 1_000 },
      { questionId: publicQuestionId, viewedAt: T0 + 2_000 },
    ];

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, { history });
    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, { history });

    const { views, relation } = await t.run(async (ctx) => ({
      views: (await ctx.db.query("analytics").collect()).filter((row) => row.userId === otherId),
      relation: (await ctx.db.query("userQuestions").collect()).find((row) => row.userId === otherId),
    }));
    expect(views).toHaveLength(2);
    expect(relation?.seenCount).toBe(2);
  });
});

async function rows(t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) {
  return await t.run(async (ctx) => ({
    views: (await ctx.db.query("analytics").collect()).filter((row) => row.userId === userId),
    relations: (await ctx.db.query("userQuestions").collect()).filter((row) => row.userId === userId),
  }));
}

async function deletedQuestionId(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("questions", { text: "Gone", status: "public", ...counters });
    await ctx.db.delete(id);
    return id;
  });
}

describe("hidden lists and history merges apply the same visibility", () => {
  test("merging hidden questions skips another user's private question and bad ids", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownHiddenQuestions, {
      hiddenQuestions: [privateQuestionId, publicQuestionId, "not-a-real-id", otherId],
    });

    const { relations } = await rows(t, otherId);
    expect(relations.map((row) => [row.questionId, row.status])).toEqual([[publicQuestionId, "hidden"]]);
  });

  test("setting the hidden list skips another user's private question", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateHiddenQuestions, {
      hiddenQuestions: [privateQuestionId, publicQuestionId],
    });

    const { relations } = await rows(t, otherId);
    expect(relations.map((row) => [row.questionId, row.status])).toEqual([[publicQuestionId, "hidden"]]);
  });

  test("merging likes drops deleted questions, ids from other tables and repeats", async () => {
    const { t, otherId, publicQuestionId } = await setup();
    const goneId = await deletedQuestionId(t);

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [goneId, otherId, publicQuestionId, publicQuestionId],
    });

    const liked = await likedRelations(t, otherId);
    expect(liked.map((row) => row.questionId)).toEqual([publicQuestionId]);
  });

  test("merging history skips private, malformed and deleted entries but keeps the rest", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();
    const goneId = await deletedQuestionId(t);

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [
        { questionId: privateQuestionId, viewedAt: T0 + 1_000 },
        { questionId: "not-a-real-id", viewedAt: T0 + 2_000 },
        { questionId: goneId, viewedAt: T0 + 3_000 },
        { questionId: publicQuestionId, viewedAt: T0 + 4_000 },
      ],
    });

    const { views, relations } = await rows(t, otherId);
    expect(views.map((row) => row.questionId)).toEqual([publicQuestionId]);
    expect(relations.map((row) => [row.questionId, row.status, row.seenCount])).toEqual([
      [publicQuestionId, "seen", 1],
    ]);
  });

  test("a later merge with new entries adds only the new views", async () => {
    const { t, otherId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [{ questionId: publicQuestionId, viewedAt: T0 + 1_000 }],
    });
    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [
        { questionId: publicQuestionId, viewedAt: T0 + 1_000 },
        { questionId: publicQuestionId, viewedAt: T0 + 2_000 },
      ],
    });

    const { views, relations } = await rows(t, otherId);
    expect(views.map((row) => row.timestamp).sort()).toEqual([T0 + 1_000, T0 + 2_000]);
    expect(relations).toHaveLength(1);
    expect(relations[0]?.seenCount).toBe(2);
  });

  test("history entries with a non-finite timestamp record no view", async () => {
    const { t, otherId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [{ questionId: publicQuestionId, viewedAt: Number.NaN }],
    });

    const { views, relations } = await rows(t, otherId);
    expect(views).toEqual([]);
    expect(relations.map((row) => [row.questionId, row.seenCount])).toEqual([[publicQuestionId, 1]]);
  });

  test("history entries with impossible timestamps record no view", async () => {
    const { t, otherId, publicQuestionId } = await setup();

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeQuestionHistory, {
      history: [
        // 1e20 would crash the admin chart's date formatting; the others can't be real views.
        { questionId: publicQuestionId, viewedAt: 1e20 },
        { questionId: publicQuestionId, viewedAt: 5 },
        { questionId: publicQuestionId, viewedAt: Date.now() + 24 * 60 * 60 * 1000 },
      ],
    });

    const { views } = await rows(t, otherId);
    expect(views).toEqual([]);
  });

  test("a merge from a client that still sends its workspace lands in the personal workspace", async () => {
    const { t, otherId, publicQuestionId } = await setup();
    const orgId = await t.run(async (ctx) =>
      ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" }),
    );

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [publicQuestionId],
      organizationId: orgId,
    });

    const liked = await likedRelations(t, otherId);
    expect(liked.map((row) => [row.questionId, row.organizationId])).toEqual([[publicQuestionId, undefined]]);
  });
});

describe("recordAnalytics edge cases", () => {
  test("an event on a deleted question writes nothing", async () => {
    const { t } = await setup();
    const goneId = await deletedQuestionId(t);

    const result = await t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
      questionId: goneId,
      event: "liked",
      viewDuration: 0,
    });

    expect(result).toBeNull();
    const { analytics, relations } = await t.run(async (ctx) => ({
      analytics: await ctx.db.query("analytics").collect(),
      relations: await ctx.db.query("userQuestions").collect(),
    }));
    expect(analytics).toEqual([]);
    expect(relations).toEqual([]);
  });

  test("the owner's like on their own private question counts", async () => {
    const { t, ownerId, privateQuestionId } = await setup();

    await t.withIdentity(OWNER).mutation(api.core.questions.recordAnalytics, {
      questionId: privateQuestionId,
      event: "liked",
      viewDuration: 0,
    });

    const question = await t.run(async (ctx) => await ctx.db.get(privateQuestionId));
    expect(question?.totalLikes).toBe(1);
    expect((await likedRelations(t, ownerId)).map((row) => row.questionId)).toEqual([privateQuestionId]);
  });

  test("a signed-in caller is matched by Clerk id even when the email differs", async () => {
    const { t, otherId, publicQuestionId } = await setup();

    await t
      .withIdentity({ ...OTHER, email: "renamed@example.com" })
      .mutation(api.core.questions.recordAnalytics, {
        questionId: publicQuestionId,
        event: "liked",
        viewDuration: 0,
      });

    expect((await likedRelations(t, otherId)).map((row) => row.questionId)).toEqual([publicQuestionId]);
  });

  test("an identity with no user row is treated as an anonymous session", async () => {
    const { t, privateQuestionId, publicQuestionId } = await setup();
    const ghost = t.withIdentity({ subject: "ghost-clerk", tokenIdentifier: "test|ghost", email: "ghost@example.com" });
    const like = (questionId: Id<"questions">) =>
      ghost.mutation(api.core.questions.recordAnalytics, {
        questionId,
        event: "liked",
        viewDuration: 0,
        sessionId: "ghost-session",
      });

    await like(publicQuestionId);
    await like(publicQuestionId);
    await like(privateQuestionId);

    const { publicQuestion, privateQuestion, relations } = await t.run(async (ctx) => ({
      publicQuestion: await ctx.db.get(publicQuestionId),
      privateQuestion: await ctx.db.get(privateQuestionId),
      relations: await ctx.db.query("userQuestions").collect(),
    }));
    expect(publicQuestion?.totalLikes).toBe(1);
    expect(privateQuestion?.totalLikes).toBe(0);
    expect(privateQuestion?.totalShows).toBe(0);
    expect(relations).toEqual([]);
  });

  test("other events in a session don't block a like, and each question counts separately", async () => {
    const { t, publicQuestionId } = await setup();
    const secondQuestionId = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: "Another public question?", status: "public", ...counters }),
    );
    const record = (event: "seen" | "liked", questionId: Id<"questions">, sessionId?: string) =>
      (sessionId ? t : t.withIdentity(OTHER)).mutation(api.core.questions.recordAnalytics, {
        questionId,
        event,
        viewDuration: 0,
        sessionId,
      });

    // Anonymous session: a view first, then likes on two questions.
    await record("seen", publicQuestionId, "session-a");
    await record("liked", publicQuestionId, "session-a");
    await record("liked", secondQuestionId, "session-a");
    // Signed-in user: likes on two questions.
    await record("liked", publicQuestionId);
    await record("liked", secondQuestionId);

    const [first, second] = await t.run(async (ctx) => [
      await ctx.db.get(publicQuestionId),
      await ctx.db.get(secondQuestionId),
    ]);
    expect(first?.totalLikes).toBe(2);
    expect(second?.totalLikes).toBe(2);
  });

  test("a non-finite view duration is recorded as zero", async () => {
    const { t, publicQuestionId } = await setup();

    await t.mutation(api.core.questions.recordAnalytics, {
      questionId: publicQuestionId,
      event: "seen",
      viewDuration: Number.NaN,
    });

    const { question, analytics } = await t.run(async (ctx) => ({
      question: await ctx.db.get(publicQuestionId),
      analytics: await ctx.db.query("analytics").collect(),
    }));
    expect(question?.totalShows).toBe(1);
    expect(question?.averageViewDuration).toBe(0);
    expect(question?.totalLikes).toBe(0);
    expect(analytics.map((row) => row.viewDuration)).toEqual([0]);
  });
});

describe("remix visibility", () => {
  test("the owner can still remix their own private question", async () => {
    const { t, ownerId } = await setup();
    // No text, so the remix stops before calling the model, after the visibility check.
    const textlessId = await t.run(async (ctx) =>
      ctx.db.insert("questions", { authorId: ownerId, status: "private", ...counters }),
    );

    await expect(
      t.withIdentity(OWNER).action(api.core.questions.remixQuestionForUser, { questionId: textlessId }),
    ).rejects.toThrow("Question text not found.");
  });
});

describe("liked list filtering", () => {
  test("the liked list skips deleted questions and questions from another workspace", async () => {
    const { t, otherId, publicQuestionId } = await setup();
    const goneId = await deletedQuestionId(t);
    const orgQuestionId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { name: "Other team" });
      return await ctx.db.insert("questions", {
        text: "A team's public question?",
        status: "public",
        organizationId,
        ...counters,
      });
    });
    await t.run(async (ctx) => {
      for (const questionId of [goneId, orgQuestionId, publicQuestionId]) {
        await ctx.db.insert("userQuestions", { userId: otherId, questionId, status: "liked", updatedAt: Date.now() });
      }
    });

    const liked = await t.withIdentity(OTHER).query(api.core.questions.getLikedQuestions, {});
    expect(liked.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([publicQuestionId]);
  });
});

describe("updating the liked list keeps likes the user can no longer read", () => {
  test("a stored like on a now-unreadable question survives an update that still lists it", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userQuestions", { userId: otherId, questionId: privateQuestionId, status: "liked", updatedAt: Date.now() });
    });

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateLikedQuestions, {
      likedQuestions: [privateQuestionId, publicQuestionId],
    });

    const liked = await likedRelations(t, otherId);
    expect(new Set(liked.map((row) => row.questionId))).toEqual(new Set([privateQuestionId, publicQuestionId]));
    const visible = await t.withIdentity(OTHER).query(api.core.questions.getLikedQuestions, {});
    expect(visible.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([publicQuestionId]);
  });

  test("a like the client drops is still demoted", async () => {
    const { t, otherId, privateQuestionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userQuestions", { userId: otherId, questionId: privateQuestionId, status: "liked", updatedAt: Date.now() });
    });

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateLikedQuestions, { likedQuestions: [] });

    expect(await likedRelations(t, otherId)).toEqual([]);
  });
});

describe("updating the hidden list keeps hides the user can no longer read", () => {
  async function hiddenRelations(t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) {
    return await t.run(async (ctx) =>
      (await ctx.db.query("userQuestions").collect()).filter(
        (row) => row.userId === userId && row.status === "hidden",
      ),
    );
  }

  test("a stored hide on a now-unreadable question survives an update that still lists it", async () => {
    const { t, otherId, privateQuestionId, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userQuestions", { userId: otherId, questionId: privateQuestionId, status: "hidden", updatedAt: Date.now() });
    });

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateHiddenQuestions, {
      hiddenQuestions: [privateQuestionId, publicQuestionId],
    });

    const hidden = await hiddenRelations(t, otherId);
    expect(new Set(hidden.map((row) => row.questionId))).toEqual(new Set([privateQuestionId, publicQuestionId]));
  });

  test("a hide the client drops is undone", async () => {
    const { t, otherId, privateQuestionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userQuestions", { userId: otherId, questionId: privateQuestionId, status: "hidden", updatedAt: Date.now() });
    });

    await t.withIdentity(OTHER).mutation(api.core.userSettings.updateHiddenQuestions, { hiddenQuestions: [] });

    expect(await hiddenRelations(t, otherId)).toEqual([]);
  });
});

describe("org questions follow membership and billing", () => {
  async function addOrgQuestion(t: Awaited<ReturnType<typeof setup>>["t"]) {
    return await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      const orgQuestionId = await ctx.db.insert("questions", {
        customText: "What did everyone do this weekend?",
        status: "private",
        organizationId: orgId,
        ...counters,
      });
      return { orgId, orgQuestionId };
    });
  }

  test("a non-member can't like or merge an org's private question", async () => {
    const { t, otherId } = await setup();
    const { orgQuestionId } = await addOrgQuestion(t);

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [orgQuestionId],
    });
    await t.withIdentity(OTHER).mutation(api.core.questions.recordAnalytics, {
      questionId: orgQuestionId,
      event: "liked",
      viewDuration: 0,
    });

    expect(await likedRelations(t, otherId)).toEqual([]);
    const question = await t.run(async (ctx) => await ctx.db.get(orgQuestionId));
    expect(question?.totalLikes).toBe(0);
  });

  test("a member of a paid org can like it, and it leaves the list when billing lapses", async () => {
    const { t, otherId } = await setup();
    const { orgId, orgQuestionId } = await addOrgQuestion(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("organization_members", { userId: otherId, organizationId: orgId, role: "member" });
    });

    await t.withIdentity(OTHER).mutation(api.core.userSettings.mergeKnownLikedQuestions, {
      likedQuestions: [orgQuestionId],
    });
    expect((await likedRelations(t, otherId)).map((row) => row.questionId)).toEqual([orgQuestionId]);
    const liked = await t.withIdentity(OTHER).query(api.core.questions.getLikedQuestions, { organizationId: orgId });
    expect(liked.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([orgQuestionId]);

    await t.run(async (ctx) => {
      await ctx.db.patch(orgId, { billingStatus: "canceled" });
    });
    expect(await t.withIdentity(OTHER).query(api.core.questions.getLikedQuestions, { organizationId: orgId })).toEqual([]);
  });
});

describe("remix usage accounting", () => {
  // Public but textless: the remix charges usage, then fails before calling the model.
  async function addOrgPublicQuestion(t: Awaited<ReturnType<typeof setup>>["t"]) {
    return await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("organizations", { name: "Gym", planTier: "team", billingStatus: "active" });
      const questionId = await ctx.db.insert("questions", { status: "public", organizationId: orgId, ...counters });
      return { orgId, questionId };
    });
  }
  async function usageRows(t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) {
    return await t.run(async (ctx) =>
      (await ctx.db.query("userAiUsage").collect())
        .filter((row) => row.userId === userId)
        .map((row) => ({ organizationId: row.organizationId, count: row.count })),
    );
  }

  test("a member's failed remix of their org's question refunds the org counter it charged", async () => {
    const { t, otherId } = await setup();
    const { orgId, questionId } = await addOrgPublicQuestion(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("organization_members", { userId: otherId, organizationId: orgId, role: "member" });
    });

    await expect(
      t.withIdentity(OTHER).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow("Question text not found.");

    expect(await usageRows(t, otherId)).toEqual([{ organizationId: orgId, count: 0 }]);
  });

  test("a non-member is charged personally, not given a fresh org allowance", async () => {
    const { t, otherId } = await setup();
    const { questionId } = await addOrgPublicQuestion(t);

    await expect(
      t.withIdentity(OTHER).action(api.core.questions.remixQuestionForUser, { questionId }),
    ).rejects.toThrow("Question text not found.");

    expect(await usageRows(t, otherId)).toEqual([{ organizationId: undefined, count: 0 }]);
  });
});

describe("user lookups follow the Clerk id, not the email", () => {
  // Same Clerk user as OWNER, but the email claim changed. Rows are seeded directly:
  // the user mutations would update the stored email and hide the mismatch.
  const RENAMED = { ...OWNER, email: "renamed@example.com" };

  test("the liked list and history still find the user's rows", async () => {
    const { t, ownerId, publicQuestionId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userQuestions", { userId: ownerId, questionId: publicQuestionId, status: "liked", updatedAt: Date.now() });
    });

    const liked = await t.withIdentity(RENAMED).query(api.core.questions.getLikedQuestions, {});
    expect(liked.map((question: { _id: Id<"questions"> }) => question._id)).toEqual([publicQuestionId]);
    const history = await t.withIdentity(RENAMED).query(api.core.userSettings.getQuestionHistory, {});
    expect(history.map((entry: { question: { _id: Id<"questions"> } }) => entry.question._id)).toEqual([publicQuestionId]);
  });

  test("remix finds the owner of a private question after an email change", async () => {
    const { t, ownerId } = await setup();
    // Private and textless: passing the user and visibility checks surfaces the text error.
    const textlessId = await t.run(async (ctx) =>
      ctx.db.insert("questions", { authorId: ownerId, status: "private", ...counters }),
    );

    await expect(
      t.withIdentity(RENAMED).action(api.core.questions.remixQuestionForUser, { questionId: textlessId }),
    ).rejects.toThrow("Question text not found.");
  });
});
