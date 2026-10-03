import { convexTest } from "convex-test";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_QUESTION_TAG_LENGTH,
  MAX_QUESTION_TAGS,
  MAX_QUESTION_TEXT_LENGTH,
} from "../constants";
import { convexErrorData } from "../lib/errorData";
import { fingerprintText } from "../lib/promptArchitecture";
import type { Doc, Id } from "../_generated/dataModel";

const AUTHOR_IDENTITY = {
  subject: "question-author",
  tokenIdentifier: "https://clerk.example|question-author",
  email: "question-author@example.com",
};

const LONGEST_QUESTION = `${"a".repeat(MAX_QUESTION_TEXT_LENGTH - 1)}?`;
const TOO_LONG_QUESTION = `${"a".repeat(MAX_QUESTION_TEXT_LENGTH)}?`;
const TOO_LONG_ERROR = {
  code: ERROR_CODES.QUESTION_TEXT_TOO_LONG,
  message: ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG,
};

async function createAuthor() {
  const t = convexTest(schema, convexFunctionModules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: AUTHOR_IDENTITY.subject,
      tokenIdentifier: AUTHOR_IDENTITY.tokenIdentifier,
      email: AUTHOR_IDENTITY.email,
    });
  });
  return { t, author: t.withIdentity(AUTHOR_IDENTITY) };
}

test("public question reads hide private questions from other users", async () => {
  const t = convexTest(schema);
  const { privateQuestionId, publicQuestionId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      email: "owner@example.com",
      clerkId: "owner",
    });
    const privateQuestionId = await ctx.db.insert("questions", {
      customText: "Owner only",
      authorId: ownerId,
      status: "private",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    const publicQuestionId = await ctx.db.insert("questions", {
      text: "Everyone can read this",
      status: "public",
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    return { privateQuestionId, publicQuestionId };
  });

  expect(
    await t.query(api.core.questions.getQuestionById, { id: privateQuestionId }),
  ).toBeNull();
  expect(
    await t.query(api.core.questions.getQuestionById, { id: publicQuestionId }),
  ).toMatchObject({ text: "Everyone can read this" });
  expect(
    await t.withIdentity({ subject: "owner", email: "owner@example.com" }).query(
      api.core.questions.getQuestionById,
      { id: privateQuestionId },
    ),
  ).toMatchObject({ customText: "Owner only" });
});

test("personal question creation always requires an authenticated author", async () => {
  const t = convexTest(schema);
  await expect(
    t.mutation(api.core.questions.addPersonalQuestion, {
      customText: "Spoofed question",
      isPublic: false,
    }),
  ).rejects.toThrow("logged in");
});

test("personal questions are saved trimmed, up to the length limit", async () => {
  const { t, author } = await createAuthor();
  const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
    customText: `  ${LONGEST_QUESTION}\n`,
    isPublic: false,
  });

  expect(questionId).not.toBeNull();
  const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
  expect(saved?.customText).toBe(LONGEST_QUESTION);
});

test("custom questions are saved trimmed, up to the length limit", async () => {
  const { t, author } = await createAuthor();
  const questionId = await author.mutation(api.core.questions.addCustomQuestion, {
    customText: `\t${LONGEST_QUESTION}  `,
    isPublic: true,
  });

  const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
  expect(saved).toMatchObject({ customText: LONGEST_QUESTION, status: "pending" });
});

test("blank new questions are skipped without an input validation error", async () => {
  const { t, author } = await createAuthor();

  expect(
    await author.mutation(api.core.questions.addPersonalQuestion, { customText: " \n ", isPublic: false }),
  ).toBeNull();
  expect(
    await author.mutation(api.core.questions.addCustomQuestion, { customText: " \n ", isPublic: true }),
  ).toBeNull();
  expect(await t.run(async (ctx) => ctx.db.query("questions").collect())).toHaveLength(0);
});

test("personal question updates save the trimmed text", async () => {
  // The update schedules an embedding filter sync, which stays queued instead of running.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
    });

    await author.mutation(api.core.questions.updatePersonalQuestion, {
      questionId: questionId!,
      customText: `  ${LONGEST_QUESTION}\n`,
      isPublic: true,
    });

    const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
    expect(saved).toMatchObject({ customText: LONGEST_QUESTION, status: "pending" });
  } finally {
    vi.useRealTimers();
  }
});

test("new questions over the length limit are rejected with a readable error", async () => {
  const { t, author } = await createAuthor();

  const personalError = await author
    .mutation(api.core.questions.addPersonalQuestion, {
      customText: TOO_LONG_QUESTION,
      isPublic: false,
    })
    .catch((error: unknown) => error);
  const customError = await author
    .mutation(api.core.questions.addCustomQuestion, {
      customText: TOO_LONG_QUESTION,
      isPublic: true,
    })
    .catch((error: unknown) => error);

  expect(convexErrorData(personalError)).toEqual(TOO_LONG_ERROR);
  expect(convexErrorData(customError)).toEqual(TOO_LONG_ERROR);
  expect(await t.run(async (ctx) => ctx.db.query("questions").collect())).toHaveLength(0);
});

test("personal question updates reject blank or over-long text and keep the saved text", async () => {
  const { t, author } = await createAuthor();
  const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
    customText: "What did you learn this week?",
    isPublic: false,
  });

  for (const [customText, expected] of [
    [TOO_LONG_QUESTION, TOO_LONG_ERROR],
    [
      "   ",
      {
        code: ERROR_CODES.QUESTION_TEXT_REQUIRED,
        message: ERROR_MESSAGES.QUESTION_TEXT_REQUIRED,
      },
    ],
  ] as const) {
    const error = await author
      .mutation(api.core.questions.updatePersonalQuestion, {
        questionId: questionId!,
        customText,
        isPublic: false,
      })
      .catch((caught: unknown) => caught);
    expect(convexErrorData(error)).toEqual(expected);
  }

  const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
  expect(saved?.customText).toBe("What did you learn this week?");
});

test("personal question updates from someone other than the author are refused before the text is checked", async () => {
  const { t, author } = await createAuthor();
  const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
    customText: "What did you learn this week?",
    isPublic: false,
  });
  const otherIdentity = {
    subject: "other-user",
    tokenIdentifier: "https://clerk.example|other-user",
    email: "other-user@example.com",
  };
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: otherIdentity.subject,
      tokenIdentifier: otherIdentity.tokenIdentifier,
      email: otherIdentity.email,
    });
  });

  for (const customText of ["A different question?", TOO_LONG_QUESTION]) {
    await expect(
      t.withIdentity(otherIdentity).mutation(api.core.questions.updatePersonalQuestion, {
        questionId: questionId!,
        customText,
        isPublic: false,
      }),
    ).rejects.toThrow("not authorized");
  }

  const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
  expect(saved?.customText).toBe("What did you learn this week?");
});

describe("personal question tags input validation", () => {
  const manyTags = (count: number) => Array.from({ length: count }, (_, i) => `tag-${i}`);
  const TOO_MANY_TAGS_ERROR = {
    code: ERROR_CODES.QUESTION_TAGS_TOO_MANY,
    message: ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY,
  };
  const TAG_TOO_LONG_ERROR = {
    code: ERROR_CODES.QUESTION_TAG_TOO_LONG,
    message: ERROR_MESSAGES.QUESTION_TAG_TOO_LONG,
  };
  const rejectedTags = [
    [manyTags(MAX_QUESTION_TAGS + 1), TOO_MANY_TAGS_ERROR],
    [["food", "a".repeat(MAX_QUESTION_TAG_LENGTH + 1)], TAG_TOO_LONG_ERROR],
  ] as const;

  // The update schedules an embedding filter sync, which stays queued instead of running.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("new questions save tags trimmed, lowercased and without blanks or repeats", async () => {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
      tags: [" Food ", "food", "", "  ", "TRAVEL", ...manyTags(MAX_QUESTION_TAGS - 2)],
    });

    const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
    expect(saved?.tags).toEqual(["food", "travel", ...manyTags(MAX_QUESTION_TAGS - 2)]);
  });

  test("updates save tags trimmed, lowercased and without blanks or repeats", async () => {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
      tags: ["food"],
    });

    await author.mutation(api.core.questions.updatePersonalQuestion, {
      questionId: questionId!,
      customText: "What did you learn this week?",
      isPublic: false,
      tags: ["Travel ", "travel", " ", "a".repeat(MAX_QUESTION_TAG_LENGTH)],
    });

    const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
    expect(saved?.tags).toEqual(["travel", "a".repeat(MAX_QUESTION_TAG_LENGTH)]);
  });

  test("new questions with too many or over-long tags are rejected with a readable error", async () => {
    const { t, author } = await createAuthor();

    for (const [tags, expected] of rejectedTags) {
      const error = await author
        .mutation(api.core.questions.addPersonalQuestion, {
          customText: "What did you learn this week?",
          isPublic: false,
          tags: [...tags],
        })
        .catch((caught: unknown) => caught);
      expect(convexErrorData(error)).toEqual(expected);
    }
    expect(await t.run(async (ctx) => ctx.db.query("questions").collect())).toHaveLength(0);
  });

  test("updates with too many or over-long tags are rejected and keep the saved question", async () => {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
      tags: ["food"],
    });

    for (const [tags, expected] of rejectedTags) {
      const error = await author
        .mutation(api.core.questions.updatePersonalQuestion, {
          questionId: questionId!,
          customText: "A different question?",
          isPublic: false,
          tags: [...tags],
        })
        .catch((caught: unknown) => caught);
      expect(convexErrorData(error)).toEqual(expected);
    }

    const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
    expect(saved).toMatchObject({ customText: "What did you learn this week?", tags: ["food"] });
  });

  test("writes without tags save no tags, and an empty list saves an empty list", async () => {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
    });
    expect((await t.run(async (ctx) => ctx.db.get(questionId!)))?.tags).toBeUndefined();

    await author.mutation(api.core.questions.updatePersonalQuestion, {
      questionId: questionId!,
      customText: "What did you learn this week?",
      isPublic: false,
      tags: [],
    });
    expect((await t.run(async (ctx) => ctx.db.get(questionId!)))?.tags).toEqual([]);
  });

  test("blank new questions with too many tags are still skipped without an error", async () => {
    const { t, author } = await createAuthor();

    expect(
      await author.mutation(api.core.questions.addPersonalQuestion, {
        customText: "   ",
        isPublic: false,
        tags: manyTags(MAX_QUESTION_TAGS + 1),
      }),
    ).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.query("questions").collect())).toHaveLength(0);
  });

  test("the question text is checked before the tags", async () => {
    const { t, author } = await createAuthor();
    const addError = await author
      .mutation(api.core.questions.addPersonalQuestion, {
        customText: TOO_LONG_QUESTION,
        isPublic: false,
        tags: manyTags(MAX_QUESTION_TAGS + 1),
      })
      .catch((caught: unknown) => caught);
    expect(convexErrorData(addError)).toEqual(TOO_LONG_ERROR);

    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
      tags: ["food"],
    });
    const updateError = await author
      .mutation(api.core.questions.updatePersonalQuestion, {
        questionId: questionId!,
        customText: TOO_LONG_QUESTION,
        isPublic: false,
        tags: manyTags(MAX_QUESTION_TAGS + 1),
      })
      .catch((caught: unknown) => caught);
    expect(convexErrorData(updateError)).toEqual(TOO_LONG_ERROR);
    expect((await t.run(async (ctx) => ctx.db.get(questionId!)))?.tags).toEqual(["food"]);
  });

  test("updates from someone other than the author are refused before the tags are checked", async () => {
    const { t, author } = await createAuthor();
    const questionId = await author.mutation(api.core.questions.addPersonalQuestion, {
      customText: "What did you learn this week?",
      isPublic: false,
      tags: ["food"],
    });
    const otherIdentity = {
      subject: "other-user",
      tokenIdentifier: "https://clerk.example|other-user",
      email: "other-user@example.com",
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: otherIdentity.subject,
        tokenIdentifier: otherIdentity.tokenIdentifier,
        email: otherIdentity.email,
      });
    });

    for (const [tags] of rejectedTags) {
      await expect(
        t.withIdentity(otherIdentity).mutation(api.core.questions.updatePersonalQuestion, {
          questionId: questionId!,
          customText: "A different question?",
          isPublic: false,
          tags: [...tags],
        }),
      ).rejects.toThrow("not authorized");
    }

    const saved = await t.run(async (ctx) => ctx.db.get(questionId!));
    expect(saved).toMatchObject({ customText: "What did you learn this week?", tags: ["food"] });
  });

  test("a copy merged into a library question is refused before its tags are checked", async () => {
    const { t, author } = await createAuthor();
    const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
    const questionId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", AUTHOR_IDENTITY.email))
        .unique();
      const canonical = await ctx.db.insert("questions", {
        text: "What did you learn this week?",
        status: "public",
        ...counters,
      });
      return ctx.db.insert("questions", {
        authorId: user!._id,
        customText: "What did you learn this week?",
        status: "pruned",
        prunedAt: 1,
        duplicateOf: canonical,
        tags: ["food"],
        ...counters,
      });
    });

    const error = await author
      .mutation(api.core.questions.updatePersonalQuestion, {
        questionId,
        customText: "A different question?",
        isPublic: false,
        tags: manyTags(MAX_QUESTION_TAGS + 1),
      })
      .catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.QUESTION_MERGED_AS_DUPLICATE,
      message: ERROR_MESSAGES.QUESTION_MERGED_AS_DUPLICATE,
    });
    expect((await t.run(async (ctx) => ctx.db.get(questionId)))?.tags).toEqual(["food"]);
  });
});

describe("author edits go back through review", () => {
  const editor = { subject: "editor", tokenIdentifier: "https://issuer.test|editor", metadata: { isAdmin: "true" } };
  const counters = { totalLikes: 0, totalShows: 0, averageViewDuration: 0 };
  const firstWording = "What did you learn this week?";
  const newWording = "What surprised you most this week?";

  // Scheduled embedding jobs stay queued instead of running.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function setup(fields: Partial<Doc<"questions">>) {
    const { t, author } = await createAuthor();
    const questionId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", AUTHOR_IDENTITY.email))
        .unique();
      return ctx.db.insert("questions", { authorId: user!._id, ...counters, ...fields });
    });
    return { t, author, admin: t.withIdentity(editor), questionId };
  }

  function reword(author: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, questionId: Id<"questions">) {
    return author.mutation(api.core.questions.updatePersonalQuestion, { questionId, customText: newWording, isPublic: true });
  }

  async function embedJobs(t: ReturnType<typeof convexTest>) {
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
    return scheduled.filter((job) => job.name === "lib/retriever:embedQuestion" && job.state.kind === "pending");
  }

  async function embeddings(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => ctx.db.query("question_embeddings").collect());
  }

  test("an earlier review can't be undone once the author has edited the question", async () => {
    const { t, author, admin, questionId } = await setup({
      customText: firstWording,
      status: "public",
      fingerprint: fingerprintText(firstWording),
    });
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      expectedRevision: 0,
      reviewReason: "Back to pending",
      status: "pending",
    });
    await reword(author, questionId);

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "question" });
    await expect(admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id })).rejects.toThrow("newer work");
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "pending", customText: newWording });
  });

  test("an approval started before the author's edit has to reload, then approves the new wording", async () => {
    const { t, author, admin, questionId } = await setup({ customText: firstWording, status: "pending" });
    await reword(author, questionId);

    await expect(
      admin.mutation(api.admin.questions.updateQuestion, {
        id: questionId,
        expectedRevision: 0,
        reviewReason: "Approve",
        status: "public",
      }),
    ).rejects.toThrow("changed during review");
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "pending" });

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      expectedRevision: 1,
      reviewReason: "Approve",
      status: "public",
    });
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({
      status: "public",
      fingerprint: fingerprintText(newWording),
    });
  });

  test("making a private question public starts a new review revision", async () => {
    const { t, author, questionId } = await setup({ customText: firstWording, status: "private", reviewRevision: 3 });

    await author.mutation(api.core.questions.makeQuestionPublic, { questionId });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "pending", reviewRevision: 4 });
  });

  test("a copy merged into a library question can't be edited by its author and keeps its public link", async () => {
    const { t, author, questionId } = await setup({
      customText: firstWording,
      text: firstWording,
      status: "pruned",
      prunedAt: 1,
      duplicateWasPublic: true,
    });
    const canonical = await t.run(async (ctx) =>
      ctx.db.insert("questions", { text: firstWording, status: "public", ...counters }),
    );
    await t.run(async (ctx) => ctx.db.patch(questionId, { duplicateOf: canonical }));
    const before = await t.run(async (ctx) => ctx.db.get(questionId));

    const error = await reword(author, questionId).catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.QUESTION_MERGED_AS_DUPLICATE,
      message: ERROR_MESSAGES.QUESTION_MERGED_AS_DUPLICATE,
    });
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toEqual(before);
    expect(await t.query(api.core.questions.getQuestionById, { id: questionId })).toMatchObject({ text: firstWording });
  });

  test.each([
    ["pending", true],
    ["private", false],
  ] as const)("an author edit to a pruned question saves it %s and no longer retired", async (status, isPublic) => {
    const { author, questionId } = await setup({
      customText: firstWording,
      text: firstWording,
      status: "pruned",
      prunedAt: 1,
      reviewRevision: 1,
    });

    const edited = await author.mutation(api.core.questions.updatePersonalQuestion, { questionId, customText: newWording, isPublic });

    expect(edited).toMatchObject({ customText: newWording, status, reviewRevision: 2 });
    expect(edited!.prunedAt).toBeUndefined();
  });

  test("an author edit to a question older pruning marked with only prunedAt un-retires it without keeping the pruned wording as reviewed text", async () => {
    const { t, author, admin, questionId } = await setup({ customText: firstWording, status: "approved", prunedAt: 1 });

    const edited = await reword(author, questionId);

    expect(edited).toMatchObject({ customText: newWording, status: "pending", reviewRevision: 1 });
    expect(edited!.prunedAt).toBeUndefined();
    expect(edited!.text).toBeUndefined();
    const queue = await admin.query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((question: Doc<"questions">) => question._id)).toEqual([questionId]);
    expect(await t.query(api.core.questions.getQuestionById, { id: questionId })).toBeNull();
  });

  test("an author edit to a pruned question waits in the review queue, and the prune can't be undone over it", async () => {
    const { t, author, admin, questionId } = await setup({ customText: firstWording, text: firstWording, status: "public" });
    const pruningId = await t.run(async (ctx) =>
      ctx.db.insert("pruning", { questionId, status: "pending", reason: "Low engagement" }),
    );
    await admin.mutation(api.admin.pruning.approvePruning, { pruningId, reason: "Low engagement", expectedRevision: 0 });

    await reword(author, questionId);

    const queue = await admin.query(api.admin.questions.getPendingQuestions, {});
    expect(queue.map((question: Doc<"questions">) => question._id)).toEqual([questionId]);
    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    await expect(admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id })).rejects.toThrow("newer work");
  });

  test("an author edit keeps the reviewed text, saves their wording, and drops the embedding while it waits for review", async () => {
    const { t, author, questionId } = await setup({
      customText: firstWording,
      text: firstWording,
      status: "public",
      fingerprint: fingerprintText(firstWording),
      reviewRevision: 1,
    });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" }),
    );

    const edited = await reword(author, questionId);

    expect(edited).toMatchObject({ text: firstWording, customText: newWording, status: "pending", reviewRevision: 2 });
    expect(edited!.fingerprint).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ text: firstWording, customText: newWording });
    expect(await embeddings(t)).toHaveLength(0);
    expect(await embedJobs(t)).toHaveLength(0);
  });

  // The questions page sends the shown wording with Approve; the detail page sends the status alone.
  test.each([
    ["the questions page", (q: Doc<"questions">) => ({ text: q.text || q.customText! })],
    ["the detail page", () => ({})],
  ])("re-approving on %s after the author rewords keeps, fingerprints and embeds the reviewed wording once", async (_page, wordingSent) => {
    // The first Approve on the questions page copied the wording into text.
    const { t, author, admin, questionId } = await setup({
      customText: firstWording,
      text: firstWording,
      status: "public",
      fingerprint: fingerprintText(firstWording),
      reviewRevision: 1,
    });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" }),
    );
    await reword(author, questionId);
    expect(await embedJobs(t)).toHaveLength(0);

    const q = (await t.run(async (ctx) => ctx.db.get(questionId)))!;
    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      expectedRevision: 2,
      reviewReason: "Approve",
      status: "public",
      ...wordingSent(q),
    });
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({
      status: "public",
      text: firstWording,
      customText: newWording,
      fingerprint: fingerprintText(firstWording),
    });
    expect(await embedJobs(t)).toHaveLength(1);

    const embedCreate = vi
      .spyOn(OpenAI.Embeddings.prototype, "create")
      .mockResolvedValue({ data: [{ embedding: [0, 1] }] } as never);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(embedCreate).toHaveBeenCalledTimes(1);
    expect(embedCreate).toHaveBeenCalledWith(expect.objectContaining({ input: firstWording }));
    expect(await embeddings(t)).toEqual([expect.objectContaining({ questionId, embedding: [0, 1], status: "public" })]);
  });

  test("an embedding job for a question that has turned private doesn't send its wording", async () => {
    const { t, questionId } = await setup({ customText: firstWording, status: "private" });
    const embedCreate = vi
      .spyOn(OpenAI.Embeddings.prototype, "create")
      .mockResolvedValue({ data: [{ embedding: [0, 1] }] } as never);

    await t.action(internal.lib.retriever.embedQuestion, { questionId });

    expect(embedCreate).not.toHaveBeenCalled();
    expect(await embeddings(t)).toHaveLength(0);
  });

  test("approving a question whose shown wording already has an embedding doesn't embed it again", async () => {
    const { t, admin, questionId } = await setup({ customText: firstWording, status: "pending" });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "pending" }),
    );

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      expectedRevision: 0,
      reviewReason: "Approve",
      status: "public",
      text: firstWording,
    });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "public", text: firstWording });
    expect(await embedJobs(t)).toHaveLength(0);
    expect(await embeddings(t)).toEqual([expect.objectContaining({ embedding: [1, 0] })]);
  });

  test("the missing-embedding backfill picks up a public submission showing the author's wording, not a private one", async () => {
    const { t, questionId: approved } = await setup({ customText: firstWording, status: "public" });
    const { privateQuestion, reviewedThenPrivate, library } = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", AUTHOR_IDENTITY.email))
        .unique();
      return {
        privateQuestion: await ctx.db.insert("questions", { authorId: user!._id, customText: newWording, status: "private", ...counters }),
        // An approval copied the wording into text before the question was made private again.
        reviewedThenPrivate: await ctx.db.insert("questions", {
          authorId: user!._id,
          customText: newWording,
          text: newWording,
          status: "private",
          ...counters,
        }),
        library: await ctx.db.insert("questions", { text: newWording, status: "pruned", ...counters }),
      };
    });

    const missing = await t.query(internal.internal.questions.getQuestionsWithMissingEmbeddings, {});

    const ids = missing.map((question) => question._id);
    expect(ids).toEqual(expect.arrayContaining([approved, library]));
    expect(ids).not.toContain(privateQuestion);
    expect(ids).not.toContain(reviewedThenPrivate);
  });

  test("an author edit that keeps the wording on a question that stays private removes its embedding", async () => {
    const { t, author, questionId } = await setup({ text: firstWording, customText: "An older draft?", status: "private" });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "private" }),
    );

    await author.mutation(api.core.questions.updatePersonalQuestion, { questionId, customText: firstWording, isPublic: false });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ customText: firstWording, status: "private" });
    expect(await embeddings(t)).toHaveLength(0);
    expect(await embedJobs(t)).toHaveLength(0);
  });

  test("an admin edit that keeps a public question's wording keeps its embedding", async () => {
    const { t, admin, questionId } = await setup({ customText: firstWording, text: firstWording, status: "public" });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" }),
    );

    await admin.mutation(api.admin.questions.updateQuestion, { id: questionId, reviewReason: "Retag", tags: ["travel"] });

    expect(await embeddings(t)).toEqual([expect.objectContaining({ questionId, embedding: [1, 0] })]);
    expect(await embedJobs(t)).toHaveLength(0);
  });

  test("Mark Personal with the status alone removes a public submission's embedding", async () => {
    const { t, admin, questionId } = await setup({ customText: firstWording, text: firstWording, status: "public" });
    await t.run(async (ctx) =>
      ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" }),
    );

    await admin.mutation(api.admin.questions.updateQuestion, {
      id: questionId,
      expectedRevision: 0,
      reviewReason: "Mark personal",
      status: "private",
    });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "private", text: firstWording });
    expect(await embeddings(t)).toHaveLength(0);
    expect(await embedJobs(t)).toHaveLength(0);
  });

  test("pruning a submission removes its embedding, and undoing the prune embeds it again", async () => {
    const { t, admin, questionId } = await setup({ customText: firstWording, text: firstWording, status: "public" });
    const pruningId = await t.run(async (ctx) => {
      await ctx.db.insert("question_embeddings", { questionId, embedding: [1, 0], status: "public" });
      return ctx.db.insert("pruning", { questionId, status: "pending", reason: "Low engagement" });
    });

    await admin.mutation(api.admin.pruning.approvePruning, { pruningId, reason: "Prune", expectedRevision: 0 });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "pruned" });
    expect(await embeddings(t)).toHaveLength(0);
    expect(await embedJobs(t)).toHaveLength(0);

    const [review] = await admin.query(api.admin.pruning.getReviewHistory, { source: "pruning" });
    await admin.mutation(api.admin.pruning.undoReview, { reviewId: review._id });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "public" });
    expect(await embedJobs(t)).toHaveLength(1);
  });

  test("an edit kept private still starts a new review revision", async () => {
    const { t, author, questionId } = await setup({ customText: firstWording, status: "private", reviewRevision: 2 });

    await author.mutation(api.core.questions.updatePersonalQuestion, { questionId, customText: newWording, isPublic: false });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "private", reviewRevision: 3 });
  });

  test("an approval started before a private question was made public has to reload", async () => {
    const { t, author, admin, questionId } = await setup({ customText: firstWording, status: "private" });
    await author.mutation(api.core.questions.makeQuestionPublic, { questionId });

    await expect(
      admin.mutation(api.admin.questions.updateQuestion, {
        id: questionId,
        expectedRevision: 0,
        reviewReason: "Approve",
        status: "public",
      }),
    ).rejects.toThrow("changed during review");
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ status: "pending", reviewRevision: 1 });
  });

  async function setupMergedCopy() {
    const context = await setup({
      customText: firstWording,
      text: firstWording,
      status: "pruned",
      prunedAt: 1,
      duplicateWasPublic: false,
    });
    const canonical = await context.t.run(async (ctx) =>
      ctx.db.insert("questions", { text: firstWording, status: "public", ...counters }),
    );
    await context.t.run(async (ctx) => ctx.db.patch(context.questionId, { duplicateOf: canonical }));
    return { ...context, canonical };
  }

  test("a copy merged into a library question can't be resubmitted for review by its author", async () => {
    const { t, author, questionId } = await setupMergedCopy();
    const before = await t.run(async (ctx) => ctx.db.get(questionId));

    const error = await author
      .mutation(api.core.questions.makeQuestionPublic, { questionId })
      .catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual({
      code: ERROR_CODES.QUESTION_MERGED_AS_DUPLICATE,
      message: ERROR_MESSAGES.QUESTION_MERGED_AS_DUPLICATE,
    });
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toEqual(before);
  });

  test("an author can still delete their copy merged into a library question, and the library question stays", async () => {
    const { t, author, questionId, canonical } = await setupMergedCopy();

    await author.mutation(api.core.questions.deletePersonalQuestion, { questionId });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(canonical))).toMatchObject({ text: firstWording, status: "public" });
  });

  /** The author's question, plus a copy merged into `mergedInto` (the author's question by default). */
  async function setupKeptQuestion(fields: Partial<Doc<"questions">>, mergedInto?: "elsewhere") {
    const context = await setup(fields);
    const target = mergedInto
      ? await context.t.run(async (ctx) => ctx.db.insert("questions", { text: newWording, status: "public", ...counters }))
      : context.questionId;
    const copy = await context.t.run(async (ctx) =>
      ctx.db.insert("questions", {
        text: firstWording,
        status: "pruned",
        prunedAt: 1,
        duplicateOf: target,
        duplicateWasPublic: true,
        ...counters,
      }),
    );
    return { ...context, copy };
  }

  type Author = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  const MERGED_COPIES_ERROR = {
    code: ERROR_CODES.QUESTION_HAS_MERGED_COPIES,
    message: ERROR_MESSAGES.QUESTION_HAS_MERGED_COPIES,
  };

  test.each([
    ["edited", { customText: firstWording, text: firstWording, status: "public" as const }, (author: Author, questionId: Id<"questions">) => reword(author, questionId)],
    ["resubmitted for review", { customText: firstWording, status: "private" as const }, (author: Author, questionId: Id<"questions">) => author.mutation(api.core.questions.makeQuestionPublic, { questionId })],
    ["deleted", { customText: firstWording, text: firstWording, status: "public" as const }, (author: Author, questionId: Id<"questions">) => author.mutation(api.core.questions.deletePersonalQuestion, { questionId })],
  ])("a question other copies were merged into can't be %s by its author", async (_action, fields, act) => {
    const { t, author, questionId, copy } = await setupKeptQuestion(fields);
    const before = await t.run(async (ctx) => Promise.all([ctx.db.get(questionId), ctx.db.get(copy)]));

    const error = await act(author, questionId).catch((caught: unknown) => caught);

    expect(convexErrorData(error)).toEqual(MERGED_COPIES_ERROR);
    expect(await t.run(async (ctx) => Promise.all([ctx.db.get(questionId), ctx.db.get(copy)]))).toEqual(before);
  });

  test("a question nobody was merged into can still be edited, resubmitted and deleted by its author", async () => {
    const { t, author, questionId, copy } = await setupKeptQuestion({ customText: firstWording, status: "private" }, "elsewhere");

    await author.mutation(api.core.questions.updatePersonalQuestion, { questionId, customText: newWording, isPublic: false });
    await author.mutation(api.core.questions.makeQuestionPublic, { questionId });
    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toMatchObject({ customText: newWording, status: "pending" });
    await author.mutation(api.core.questions.deletePersonalQuestion, { questionId });

    expect(await t.run(async (ctx) => ctx.db.get(questionId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(copy))).not.toBeNull();
  });
});

test("getUserLikedAndPreferredEmbedding should ignore empty user embedding", async () => {
  const t = convexTest(schema);

  // 1. Create a user with an empty preference embedding
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });
  });

  // 2. Create liked questions with valid embeddings
  await t.run(async (ctx) => {
    const q1 = await ctx.db.insert("questions", {
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    const q2 = await ctx.db.insert("questions", {
      totalLikes: 0,
      totalShows: 0,
      averageViewDuration: 0,
    });
    // Create question_embeddings rows (the function reads from this table, not from questions.embedding)
    await ctx.db.insert("question_embeddings", {
      questionId: q1,
      embedding: [1, 1, 1],
    });
    await ctx.db.insert("question_embeddings", {
      questionId: q2,
      embedding: [3, 3, 3],
    });
    await ctx.db.insert("userQuestions", { userId, questionId: q1, status: "liked", updatedAt: Date.now() });
    await ctx.db.insert("userQuestions", { userId, questionId: q2, status: "liked", updatedAt: Date.now() });
  });

  // 3. Mock identity and call the query
  const identity = { subject: "test-user-id", email: "test@example.com" };
  const result = await t.withIdentity(identity).query(api.core.questions.getUserLikedAndPreferredEmbedding);

  // 4. Assert the average is correct (should be [2, 2, 2])
  // The failing implementation would likely produce a skewed result (e.g. [1.33, 1.33, 1.33])
  expect(result).toBeDefined();
  expect(result).not.toBeNull();
  expect(result).toEqual([2, 2, 2]);
});
