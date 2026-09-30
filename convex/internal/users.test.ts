import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexFunctionModules } from "../../vitestConvexModules";

const counters = { averageViewDuration: 0, totalLikes: 0, totalShows: 0 };

async function setup() {
	const t = convexTest(schema, convexFunctionModules);
	const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "reader@example.com" }));
	return { t, userId };
}

type Fields = { text?: string; customText?: string };

async function markQuestions(
	t: Awaited<ReturnType<typeof setup>>["t"],
	userId: Id<"users">,
	status: "seen" | "hidden",
	questions: Fields[],
) {
	return await t.run(async (ctx) => {
		const ids: Id<"questions">[] = [];
		for (const [i, fields] of questions.entries()) {
			const questionId = await ctx.db.insert("questions", { ...counters, ...fields });
			await ctx.db.insert("userQuestions", { userId, questionId, status, updatedAt: 1000 + i });
			ids.push(questionId);
		}
		return ids;
	});
}

describe.each([
	["seen", internal.internal.users.getRecentlySeenQuestions],
	["hidden", internal.internal.users.getBlockedQuestions],
] as const)("the %s questions excluded from generation", (status, query) => {
	test("a personal question with only customText contributes its customText", async () => {
		const { t, userId } = await setup();
		await markQuestions(t, userId, status, [
			{ text: "What made you laugh this week?" },
			{ customText: "What should our team name be?" },
		]);

		const texts = await t.query(query, { userId });

		expect(texts).toEqual(["What should our team name be?", "What made you laugh this week?"]);
	});

	test("a question with no text at all is left out", async () => {
		const { t, userId } = await setup();
		await markQuestions(t, userId, status, [{ text: "What made you laugh this week?" }, {}]);

		expect(await t.query(query, { userId })).toEqual(["What made you laugh this week?"]);
	});

	test("deleted questions don't push older ones off the list", async () => {
		const { t, userId } = await setup();
		const ids = await markQuestions(t, userId, status, [
			{ text: "Oldest" },
			{ text: "Older" },
			{ text: "Old" },
			{ text: "Deleted 1" },
			{ text: "Deleted 2" },
			{ text: "Deleted 3" },
		]);
		await t.run(async (ctx) => {
			for (const id of ids.slice(3)) await ctx.db.delete(id);
		});

		expect(await t.query(query, { userId })).toEqual(["Old", "Older", "Oldest"]);
	});

	test("returns at most the limit, newest first", async () => {
		const { t, userId } = await setup();
		await markQuestions(t, userId, status, [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }]);

		expect(await t.query(query, { userId })).toEqual(["D", "C", "B"]);
		expect(await t.query(query, { userId, limit: 1 })).toEqual(["D"]);
	});
});
