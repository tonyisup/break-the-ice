import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import { ERROR_CODES, ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../constants";
import { convexErrorData } from "../lib/errorData";

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
  // The update schedules an embedding-filter sync, which must finish inside the test.
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
    await t.finishAllScheduledFunctions(vi.runAllTimers);

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
