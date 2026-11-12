import { convexTest } from "convex-test";
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexFunctionModules } from "../vitestConvexModules";
import { USER_DELETION_PAGE_SIZE } from "./internal/userDeletion";

const newTest = () => convexTest(schema, convexFunctionModules);
type Test = ReturnType<typeof newTest>;

const counters = { averageViewDuration: 0, totalLikes: 0, totalShows: 0 };
const webhookSecret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("CLERK_WEBHOOK_SECRET", webhookSecret);
	vi.stubEnv("CLERK_SECRET_KEY", "sk_test_key");
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

function signedWebhookRequest(event: unknown) {
	const payload = JSON.stringify(event);
	const messageId = `msg_${crypto.randomUUID()}`;
	const timestamp = new Date();
	return {
		method: "POST",
		body: payload,
		headers: {
			"content-type": "application/json",
			"svix-id": messageId,
			"svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
			"svix-signature": new Webhook(webhookSecret).sign(messageId, timestamp, payload),
		},
	};
}

/** A person with a row in every table their deletion touches, and someone else with a like. */
async function seedPerson(t: Test, clerkId: string) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", { clerkId, email: `${clerkId}@example.com`, newsletterSubscriptionStatus: "subscribed" });
		const otherId = await ctx.db.insert("users", { clerkId: "user_other", email: "other@example.com" });
		const library = await ctx.db.insert("questions", { ...counters, text: "What made you laugh this week?", status: "public" });
		const privateOwn = await ctx.db.insert("questions", { ...counters, customText: "My own question", authorId: userId, kind: "personal", status: "private" });
		const pendingOwn = await ctx.db.insert("questions", { ...counters, customText: "Sent for review", authorId: userId, kind: "personal", status: "pending" });
		const publicOwn = await ctx.db.insert("questions", { ...counters, text: "Approved for everyone", authorId: userId, status: "public" });
		const styleId = await ctx.db.insert("styles", { id: "pick-one", name: "Pick One", structure: "", color: "", icon: "" });
		const toneId = await ctx.db.insert("tones", { id: "warm", name: "Warm", promptGuidanceForAI: "", color: "", icon: "" });

		await ctx.db.insert("userQuestions", { userId, questionId: library, status: "liked", updatedAt: 1 });
		await ctx.db.insert("userQuestions", { userId: otherId, questionId: privateOwn, status: "seen", updatedAt: 1 });
		await ctx.db.insert("userQuestions", { userId: otherId, questionId: library, status: "liked", updatedAt: 1 });
		await ctx.db.insert("userStyles", { userId, styleId, status: "hidden", updatedAt: 1 });
		await ctx.db.insert("userTones", { userId, toneId, status: "hidden", updatedAt: 1 });
		await ctx.db.insert("userAiUsage", { userId, count: 3, cycleStart: 0 });
		await ctx.db.insert("user_embeddings", { userId, embedding: [0.1] });
		await ctx.db.insert("question_embeddings", { questionId: privateOwn, embedding: [0.2] });
		await ctx.db.insert("newsletterDeliveries", { deliveryDate: "2026-11-11", email: `${clerkId}@example.com`, userId, status: "sent", attemptCount: 1, createdAt: 0, updatedAt: 0 });
		const event = await ctx.db.insert("analytics", { event: "liked", questionId: library, userId, timestamp: 0, viewDuration: 0 });
		const feedback = await ctx.db.insert("feedback", { text: "Love it", pageUrl: "/", userId, status: "new" });
		const run = await ctx.db.insert("generationRuns", {
			status: "succeeded",
			purpose: "feed",
			batchSize: 1,
			model: "@preset/break-the-ice-berg-default",
			temperature: 0.9,
			assembledPrompt: "",
			resultQuestionIds: [],
			createdAt: 0,
			requestedByUserId: userId,
		});
		return { userId, otherId, library, privateOwn, pendingOwn, publicOwn, event, feedback, run };
	});
}

async function remainingFor(t: Test, userId: Id<"users">) {
	return await t.run(async (ctx) => {
		const byUser = async (table: "userQuestions" | "userStyles" | "userTones" | "userAiUsage" | "user_embeddings") =>
			(await ctx.db.query(table).withIndex("by_userId", (q) => q.eq("userId", userId)).collect()).length;
		return {
			user: await ctx.db.get(userId),
			userQuestions: await byUser("userQuestions"),
			userStyles: await byUser("userStyles"),
			userTones: await byUser("userTones"),
			userAiUsage: await byUser("userAiUsage"),
			user_embeddings: await byUser("user_embeddings"),
			deliveries: (await ctx.db.query("newsletterDeliveries").withIndex("by_userId_deliveryDate", (q) => q.eq("userId", userId)).collect()).length,
			authored: (await ctx.db.query("questions").withIndex("by_author", (q) => q.eq("authorId", userId)).collect()).length,
		};
	});
}

const nothingLeft = {
	user: null,
	userQuestions: 0,
	userStyles: 0,
	userTones: 0,
	userAiUsage: 0,
	user_embeddings: 0,
	deliveries: 0,
	authored: 0,
};

describe("deleting a person when Clerk deletes their account", () => {
	test("user.deleted removes their rows and their unpublished questions, and keeps shared history without their id", async () => {
		const t = newTest();
		const seeded = await seedPerson(t, "user_gone");

		const response = await t.fetch("/clerk-users-webhook", signedWebhookRequest({ type: "user.deleted", data: { id: "user_gone", deleted: true, object: "user" } }));
		expect(response.status).toBe(200);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await remainingFor(t, seeded.userId)).toEqual(nothingLeft);
		await t.run(async (ctx) => {
			expect(await ctx.db.get(seeded.privateOwn)).toBeNull();
			expect(await ctx.db.get(seeded.pendingOwn)).toBeNull();
			// What pointed at a deleted question goes with it, whoever it belongs to.
			expect(await ctx.db.query("question_embeddings").collect()).toEqual([]);
			expect(await ctx.db.query("userQuestions").withIndex("by_userId", (q) => q.eq("userId", seeded.otherId)).collect())
				.toEqual([expect.objectContaining({ questionId: seeded.library, status: "liked" })]);
			// A question they got published stays in the library, without its author.
			const publicOwn = await ctx.db.get(seeded.publicOwn);
			expect([publicOwn?.text, publicOwn?.authorId]).toEqual(["Approved for everyone", undefined]);
			const event = await ctx.db.get(seeded.event);
			expect([event?.event, event?.userId]).toEqual(["liked", undefined]);
			const feedback = await ctx.db.get(seeded.feedback);
			expect([feedback?.text, feedback?.userId]).toEqual(["Love it", undefined]);
			expect((await ctx.db.get(seeded.run))?.requestedByUserId).toBeUndefined();
			expect(await ctx.db.get(seeded.otherId)).not.toBeNull();
		});
	});

	test("the daily email stops as soon as the deletion starts", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");

		await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_gone" });

		expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.newsletterSubscriptionStatus)).toBe("unsubscribed");
	});

	test("an account the app never saw, or a repeat of the event, changes nothing", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");

		expect(await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_unknown" })).toBe(0);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();

		await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_gone" });
		await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_gone" });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
	});

	test("more rows than one page holds are deleted over several pages, and the users row goes last", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		await t.run(async (ctx) => {
			for (let i = 0; i < USER_DELETION_PAGE_SIZE + 5; i++) {
				const questionId = await ctx.db.insert("questions", { ...counters, text: `Library ${i}`, status: "public" });
				await ctx.db.insert("userQuestions", { userId, questionId, status: "seen", updatedAt: i });
			}
		});

		const first = await t.mutation(internal.internal.userDeletion.deleteUserDataPage, { userId });
		expect(first).toEqual({ changed: USER_DELETION_PAGE_SIZE, isDone: false });
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
	});

	// Added by the ship test-coverage audit (Claude Opus 5.5), pass 1.
	// Value: protects=a user.deleted event with no string id is acknowledged (200) and changes nothing; fails_when=the typeof guard is dropped and the mutation validator rejects, so Clerk retries; why_new=every webhook test sends an id; seam=none; no_claim=other event types
	test("a user.deleted event without an account id is acknowledged and deletes nothing", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");

		const response = await t.fetch("/clerk-users-webhook", signedWebhookRequest({ type: "user.deleted", data: { deleted: true, object: "user" } }));
		expect(response.status).toBe(200);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user?.newsletterSubscriptionStatus).toBe("subscribed");
	});

	// Added by the ship test-coverage audit (Claude Opus 5.5), pass 1.
	// Value: protects=unpublished own questions and their uploaded images are deleted; whatever isQuestionPublic counts public stays, image kept, no author; fails_when=storage delete dropped or public test narrowed to status=public; why_new=seed has no images, approved, legacy or retired-duplicate questions; seam=none; no_claim=removeQuestionReferences internals
	test("each kind of question they wrote: unpublished ones go with their images, public ones stay without an author", async () => {
		const t = newTest();
		const { userId, library } = await seedPerson(t, "user_gone");
		const ids = await t.run(async (ctx) => {
			const privateImage = await ctx.storage.store(new Blob(["private"]));
			const publicImage = await ctx.storage.store(new Blob(["public"]));
			const own = { ...counters, authorId: userId };
			return {
				privateImage,
				publicImage,
				privateWithImage: await ctx.db.insert("questions", { ...own, customText: "Private with a picture", kind: "personal", status: "private", imageStorageId: privateImage }),
				publicWithImage: await ctx.db.insert("questions", { ...own, text: "Public with a picture", status: "public", imageStorageId: publicImage }),
				approved: await ctx.db.insert("questions", { ...own, text: "Approved earlier", status: "approved" }),
				noStatus: await ctx.db.insert("questions", { ...own, text: "Written before statuses" }),
				retiredDuplicate: await ctx.db.insert("questions", { ...own, text: "Retired as a duplicate", status: "pruned", duplicateOf: library, duplicateWasPublic: true }),
				pruned: await ctx.db.insert("questions", { ...own, text: "Pruned", status: "pruned" }),
			};
		});

		await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_gone" });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
		await t.run(async (ctx) => {
			expect(await ctx.db.get(ids.privateWithImage)).toBeNull();
			expect(await ctx.db.system.get(ids.privateImage)).toBeNull();
			expect(await ctx.db.get(ids.pruned)).toBeNull();
			for (const [id, text] of [
				[ids.publicWithImage, "Public with a picture"],
				[ids.approved, "Approved earlier"],
				[ids.noStatus, "Written before statuses"],
				[ids.retiredDuplicate, "Retired as a duplicate"],
			] as const) {
				const question = await ctx.db.get(id);
				expect([question?.text, question?.authorId]).toEqual([text, undefined]);
			}
			expect((await ctx.db.get(ids.publicWithImage))?.imageStorageId).toBe(ids.publicImage);
			expect(await ctx.db.system.get(ids.publicImage)).not.toBeNull();
		});
	});

	// Added by the ship test-coverage audit (Claude Opus 5.5), pass 1.
	// Value: protects=the users row is not deleted while authored questions remain when a page has under one question's cost of room; fails_when=the Math.max(1, ...) floor is dropped so take(0) ends the run early; why_new=the paging test fills the page before the question step; seam=none; no_claim=exact page sizes or QUESTION_COST
	test("the users row stays until their questions are gone, even when a page has almost no room left for them", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		// seedPerson gives them 6 rows deleted before their questions; leave 5 rows of room on the first page.
		await t.run(async (ctx) => {
			for (let i = 0; i < USER_DELETION_PAGE_SIZE - 11; i++) {
				const questionId = await ctx.db.insert("questions", { ...counters, text: `Library ${i}`, status: "public" });
				await ctx.db.insert("userQuestions", { userId, questionId, status: "seen", updatedAt: i });
			}
		});

		const first = await t.mutation(internal.internal.userDeletion.deleteUserDataPage, { userId });
		expect(first.isDone).toBe(false);
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
	});

	// Regression test from the ship review (Claude Opus 5.5), pass 1; reproduced first by a QA probe.
	// Value: protects=a private question is deleted when many public ones sort before it; fails_when=the page ends early because cheap public questions leave budget unused, deleting the users row first; why_new=no test had more own questions than one page reads; seam=none; no_claim=exact page sizes
	test("a private question is deleted even when more public questions than one page reads sort before it", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		const privateLast = await t.run(async (ctx) => {
			for (let i = 0; i < 25; i++) {
				await ctx.db.insert("questions", { ...counters, text: `Approved ${i}`, authorId: userId, status: "approved" });
			}
			return ctx.db.insert("questions", { ...counters, customText: "Only mine", authorId: userId, kind: "personal", status: "private" });
		});

		await t.mutation(internal.internal.userDeletion.startUserDeletion, { clerkId: "user_gone" });
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await t.run(async (ctx) => ctx.db.get(privateLast))).toBeNull();
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
	});

	// Regression test from the ship review (Claude Opus 5.5), pass 1.
	// Value: protects=a retired question in more seen lists than one page holds is still deleted, over pages, users row last; fails_when=its seen rows are removed in one unbounded transaction or the question is deleted before they are gone; why_new=no own question had other people's rows past one page; seam=none; no_claim=Convex's real transaction limits
	test("a retired question of theirs that many people saw is cleared a page at a time before it is deleted", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		const retired = await t.run(async (ctx) => {
			const questionId = await ctx.db.insert("questions", { ...counters, customText: "Was popular", authorId: userId, status: "pruned" });
			for (let i = 0; i < USER_DELETION_PAGE_SIZE + 30; i++) {
				const viewer = await ctx.db.insert("users", { email: `viewer${i}@example.com` });
				await ctx.db.insert("userQuestions", { userId: viewer, questionId, status: "seen", updatedAt: i });
			}
			return questionId;
		});

		const first = await t.mutation(internal.internal.userDeletion.deleteUserDataPage, { userId });
		expect(first.isDone).toBe(false);
		expect(await t.run(async (ctx) => ctx.db.get(retired))).not.toBeNull();

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		await t.run(async (ctx) => {
			expect(await ctx.db.get(retired)).toBeNull();
			expect(await ctx.db.query("userQuestions").withIndex("by_questionId", (q) => q.eq("questionId", retired)).collect()).toEqual([]);
		});
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
	});
});

describe("the one-time clean-up for accounts already deleted in Clerk", () => {
	function clerkHas(ids: string[]) {
		const fetchMock = vi.fn(async (url: URL | string, _init?: RequestInit) => {
			const asked = new URL(String(url)).searchParams.getAll("user_id");
			return new Response(JSON.stringify(asked.filter((id) => ids.includes(id)).map((id) => ({ id }))), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	test("a dry run lists the missing accounts and deletes nothing; a real run deletes them", async () => {
		const t = newTest();
		const { userId, otherId } = await seedPerson(t, "user_gone");
		await t.run(async (ctx) => ctx.db.insert("users", { email: "subscriber@example.com" }));
		const fetchMock = clerkHas(["user_other"]);

		const dryRun = await t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: true });
		expect(dryRun).toEqual({ checked: 2, withoutClerkId: 1, missing: ["user_gone"] });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();
		expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer sk_test_key" } });

		await t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: false });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
		expect(await t.run(async (ctx) => ctx.db.get(otherId))).not.toBeNull();
		// A row with no Clerk account (a daily-email subscriber) is left alone.
		expect(await t.run(async (ctx) => ctx.db.query("users").withIndex("email", (q) => q.eq("email", "subscriber@example.com")).unique())).not.toBeNull();
	});

	test("refuses to delete when Clerk has none of the accounts, which means the wrong key", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		clerkHas([]);

		await expect(t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: false })).rejects.toThrow(/none of these accounts/);
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();
	});

	test("stops on an answer from Clerk it can't read, before deleting anything", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

		await expect(t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: false })).rejects.toThrow(/401/);
		expect(await t.run(async (ctx) => ctx.db.get(userId))).not.toBeNull();
	});

	// Added by the ship test-coverage audit (Claude Opus 5.5), pass 1.
	// Value: protects=a Clerk account with two users rows is reported once and both rows are deleted; fails_when=startUserDeletion reads one row (first/unique) or the missing-id dedupe is dropped; why_new=all seeds have one row per clerkId; seam=none; no_claim=webhook transport
	test("an account with two users rows is listed once, and both rows are deleted", async () => {
		const t = newTest();
		const { userId } = await seedPerson(t, "user_gone");
		const secondRow = await t.run(async (ctx) => ctx.db.insert("users", { clerkId: "user_gone", email: "user_gone+again@example.com" }));
		clerkHas(["user_other"]);

		const dryRun = await t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: true });
		expect(dryRun).toEqual({ checked: 3, withoutClerkId: 0, missing: ["user_gone"] });

		await t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: false });
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await remainingFor(t, userId)).toEqual(nothingLeft);
		expect(await t.run(async (ctx) => ctx.db.get(secondRow))).toBeNull();
	});

	// Added by the ship test-coverage audit (Claude Opus 5.5), pass 1.
	// Value: protects=the clean-up checks every users row, past the first page; fails_when=the loop stops after one page or never advances the cursor; why_new=existing clean-up tests seed 3 rows, one page; seam=none; no_claim=Clerk's real limits or response shape
	test("checks every users row, past the first page", async () => {
		const t = newTest();
		await seedPerson(t, "user_gone");
		const kept = Array.from({ length: 120 }, (_, i) => `user_kept_${i}`);
		await t.run(async (ctx) => {
			for (const clerkId of kept) await ctx.db.insert("users", { clerkId, email: `${clerkId}@example.com` });
			await ctx.db.insert("users", { clerkId: "user_gone_late", email: "late@example.com" });
		});
		clerkHas([...kept, "user_other"]);

		const dryRun = await t.action(internal.internal.userDeletion.deleteUsersMissingFromClerk, { dryRun: true });
		expect(dryRun).toEqual({ checked: 123, withoutClerkId: 0, missing: ["user_gone", "user_gone_late"] });
	});
});
