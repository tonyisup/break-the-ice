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
