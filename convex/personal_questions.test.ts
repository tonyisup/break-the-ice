/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Personal questions", () => {
  test("adding a public question sets status to pending", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const email = "user@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email, name: "User" });
    });

    const questionId = await t.withIdentity({ email }).mutation(api.core.questions.addPersonalQuestion, {
      customText: "Is this public?",
      isPublic: true
    });

    const question = await t.run(async (ctx) => await ctx.db.get(questionId!));
    expect(question?.status).toBe("pending");
  });

  test("adding a private question sets status to private", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const email = "user@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email, name: "User" });
    });

    const questionId = await t.withIdentity({ email }).mutation(api.core.questions.addPersonalQuestion, {
      customText: "Is this private?",
      isPublic: false
    });

    const question = await t.run(async (ctx) => await ctx.db.get(questionId!));
    expect(question?.status).toBe("private");
  });

  test("making a private question public updates status to pending", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const email = "user@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email, name: "User" });
    });

    const questionId = await t.withIdentity({ email }).mutation(api.core.questions.addPersonalQuestion, {
      customText: "Transition me",
      isPublic: false
    });

    await t.withIdentity({ email }).mutation(api.core.questions.makeQuestionPublic, {
      questionId: questionId!
    });

    const question = await t.run(async (ctx) => await ctx.db.get(questionId!));
    expect(question?.status).toBe("pending");
  });

  test("making a public question public fails", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const email = "user@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email, name: "User" });
    });

    const questionId = await t.withIdentity({ email }).mutation(api.core.questions.addPersonalQuestion, {
      customText: "Already public",
      isPublic: true
    });

    await expect(t.withIdentity({ email }).mutation(api.core.questions.makeQuestionPublic, {
      questionId: questionId!
    })).rejects.toThrow("Only private questions can be made public.");
  });

  test("unauthorized user cannot make question public", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.ts"));
    const email1 = "user1@example.com";
    const email2 = "user2@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: email1, name: "User 1" });
      await ctx.db.insert("users", { email: email2, name: "User 2" });
    });

    const questionId = await t.withIdentity({ email: email1 }).mutation(api.core.questions.addPersonalQuestion, {
      customText: "User 1's secret",
      isPublic: false
    });

    await expect(t.withIdentity({ email: email2 }).mutation(api.core.questions.makeQuestionPublic, {
      questionId: questionId!
    })).rejects.toThrow("You are not authorized to update this question.");
  });
});
