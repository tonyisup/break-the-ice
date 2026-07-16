import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";
import { validate } from "convex-helpers/validators";
import { questionByIdResultValidator } from "./questions";

test("getQuestionById returns generated question metadata", async () => {
	const t = convexTest(schema, convexFunctionModules);
	const questionId = await t.run(async (ctx) => {
		return await ctx.db.insert("questions", {
			averageViewDuration: 0,
			fingerprint: "q_generated",
			quality: {},
			safetyFlags: [],
			source: "ai",
			status: "public",
			text: "Which song captures your career journey?",
			totalLikes: 0,
			totalShows: 0,
		});
	});
	const storedQuestion = await t.run(async (ctx) => ctx.db.get(questionId));

	expect(() =>
		validate(questionByIdResultValidator, storedQuestion, { throw: true }),
	).not.toThrow();

	await expect(
		t.query(internal.internal.questions.getQuestionById, { id: questionId }),
	).resolves.toMatchObject({
		_id: questionId,
		fingerprint: "q_generated",
		quality: {},
		safetyFlags: [],
		source: "ai",
	});
});

test("newsletter unseen selection skips questions with hidden styles", async () => {
	const t = convexTest(schema, convexFunctionModules);
	const now = Date.now();

	const { userId, hiddenQuestionId, visibleQuestionId } = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			email: "reader@example.com",
			newsletterSubscriptionStatus: "subscribed",
		});
		const archivedHiddenStyleId = await ctx.db.insert("styles", {
			id: "hidden-style",
			slug: "hidden-style",
			name: "Hidden Style v1",
			structure: "Ask a hidden-style question",
			color: "#111111",
			icon: "eye-off",
			status: "archived",
			version: 1,
			createdAt: now,
			updatedAt: now,
		});
		const activeHiddenStyleId = await ctx.db.insert("styles", {
			id: "hidden-style",
			slug: "hidden-style",
			name: "Hidden Style v2",
			structure: "Ask a hidden-style question",
			color: "#111111",
			icon: "eye-off",
			status: "active",
			version: 2,
			createdAt: now,
			updatedAt: now,
		});
		const visibleStyleId = await ctx.db.insert("styles", {
			id: "visible-style",
			slug: "visible-style",
			name: "Visible Style",
			structure: "Ask a visible-style question",
			color: "#222222",
			icon: "eye",
			status: "active",
			version: 1,
			createdAt: now,
			updatedAt: now,
		});
		const hiddenQuestionId = await ctx.db.insert("questions", {
			text: "This question uses the hidden style.",
			styleId: archivedHiddenStyleId,
			style: "hidden-style",
			status: "public",
			totalLikes: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});
		const visibleQuestionId = await ctx.db.insert("questions", {
			text: "This question uses a visible style.",
			styleId: visibleStyleId,
			style: "visible-style",
			status: "public",
			totalLikes: 0,
			totalShows: 0,
			averageViewDuration: 0,
		});

		await ctx.db.insert("userStyles", {
			userId,
			styleId: activeHiddenStyleId,
			status: "hidden",
			updatedAt: now,
		});
		await ctx.db.insert("userQuestions", {
			userId,
			questionId: hiddenQuestionId,
			status: "unseen",
			updatedAt: now - 1,
		});
		await ctx.db.insert("userQuestions", {
			userId,
			questionId: visibleQuestionId,
			status: "unseen",
			updatedAt: now,
		});

		return { userId, hiddenQuestionId, visibleQuestionId };
	});

	await expect(
		t.query(internal.internal.questions.getUnseenQuestionIdsForUser, {
			userId,
			count: 1,
		}),
	).resolves.toEqual([visibleQuestionId]);

	await expect(
		t.query(internal.internal.questions.getFirstEligibleNewsletterQuestionForUser, {
			userId,
			questionIds: [hiddenQuestionId, visibleQuestionId],
			excludedQuestionIds: [],
		}),
	).resolves.toMatchObject({ _id: visibleQuestionId });
});
