import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isQuestionPublic } from "../lib/questionAccess";
import { removeQuestionReferences } from "../lib/questionReferences";
import { isDeletedClerkAccount } from "../lib/users";

/*
 * Deleting a person when their Clerk account is deleted.
 *
 * Their own rows go: likes, seen and hidden entries, hidden styles and tones, AI usage, their
 * preference embedding, their daily-email deliveries, and every question they wrote that isn't
 * public. A public question they wrote stays in the library without its author. History that
 * counts toward shared numbers stays without their id: analytics events, feedback and
 * generation runs. Their name, email and Clerk id are cleared when the deletion starts, and
 * the Clerk id is recorded so the account can't come back; the users row goes last, once
 * nothing else is left.
 */

/** Rows one page writes. A question deleted counts as QUESTION_COST: it removes what points at it. */
export const USER_DELETION_PAGE_SIZE = 200;
const QUESTION_COST = 10;

/** Starts deleting every users row for a Clerk account. Returns how many it started. */
export const startUserDeletion = internalMutation({
	args: { clerkId: v.string() },
	returns: v.number(),
	handler: async (ctx, args) => {
		if (!(await isDeletedClerkAccount(ctx, args.clerkId))) {
			await ctx.db.insert("deletedClerkAccounts", { clerkId: args.clerkId, deletedAt: Date.now() });
		}
		const users = await ctx.db
			.query("users")
			.withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
			.collect();
		for (const user of users) {
			// Clear who they are at once: a new sign-up with the same email must get a fresh row,
			// not this one, and the daily email stops. The rest goes page by page.
			await ctx.db.patch(user._id, {
				clerkId: undefined,
				tokenIdentifier: undefined,
				email: undefined,
				phone: undefined,
				name: undefined,
				image: undefined,
				newsletterSubscriptionStatus: "unsubscribed",
				newsletterUnsubscribeToken: undefined,
			});
			await ctx.scheduler.runAfter(0, internal.internal.userDeletion.deleteUserDataPage, { userId: user._id });
		}
		return users.length;
	},
});

/** What a step changed, and whether it stopped at its budget with rows possibly left. */
type StepResult = { changed: number; more: boolean };
type Step = (ctx: MutationCtx, userId: Id<"users">, budget: number) => Promise<StepResult>;

function deleteAll(
	table: "userQuestions" | "userStyles" | "userTones" | "userAiUsage" | "user_embeddings",
): Step {
	return async (ctx, userId, budget) => {
		const rows = await ctx.db
			.query(table)
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(budget);
		for (const row of rows) await ctx.db.delete(row._id);
		return { changed: rows.length, more: rows.length === budget };
	};
}

const STEPS: Step[] = [
	deleteAll("userQuestions"),
	deleteAll("userStyles"),
	deleteAll("userTones"),
	deleteAll("userAiUsage"),
	deleteAll("user_embeddings"),
	async (ctx, userId, budget) => {
		const rows = await ctx.db
			.query("newsletterDeliveries")
			.withIndex("by_userId_deliveryDate", (q) => q.eq("userId", userId))
			.take(budget);
		for (const row of rows) await ctx.db.delete(row._id);
		return { changed: rows.length, more: rows.length === budget };
	},
	async (ctx, userId, budget) => {
		const limit = Math.max(1, Math.floor(budget / QUESTION_COST));
		const questions = await ctx.db
			.query("questions")
			.withIndex("by_author", (q) => q.eq("authorId", userId))
			.take(limit);
		let changed = 0;
		// Every deleted question settles the pending duplicate groups; read them once per page.
		let pendingGroups: Doc<"duplicateDetections">[] | undefined;
		for (const question of questions) {
			if (isQuestionPublic(question)) {
				await ctx.db.patch(question._id, { authorId: undefined });
				changed += 1;
				continue;
			}
			// A question that was once public can be in many people's seen lists: clear those a
			// page at a time, and delete the question once none are left.
			const room = budget - changed;
			if (room <= 0) return { changed, more: true };
			const seenBy = await ctx.db
				.query("userQuestions")
				.withIndex("by_questionId", (q) => q.eq("questionId", question._id))
				.take(room);
			for (const row of seenBy) await ctx.db.delete(row._id);
			changed += seenBy.length;
			if (seenBy.length === room) return { changed, more: true };
			pendingGroups ??= await ctx.db
				.query("duplicateDetections")
				.withIndex("by_status", (q) => q.eq("status", "pending"))
				.collect();
			await removeQuestionReferences(ctx, question._id, pendingGroups);
			if (question.imageStorageId) await ctx.storage.delete(question.imageStorageId);
			await ctx.db.delete(question._id);
			changed += QUESTION_COST;
		}
		return { changed, more: questions.length === limit };
	},
	async (ctx, userId, budget) => {
		const rows = await ctx.db
			.query("analytics")
			.withIndex("by_userId_event_timestamp", (q) => q.eq("userId", userId))
			.take(budget);
		for (const row of rows) await ctx.db.patch(row._id, { userId: undefined });
		return { changed: rows.length, more: rows.length === budget };
	},
	async (ctx, userId, budget) => {
		const rows = await ctx.db
			.query("feedback")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.take(budget);
		for (const row of rows) await ctx.db.patch(row._id, { userId: undefined });
		return { changed: rows.length, more: rows.length === budget };
	},
	async (ctx, userId, budget) => {
		const rows = await ctx.db
			.query("generationRuns")
			.withIndex("by_requestedByUserId", (q) => q.eq("requestedByUserId", userId))
			.take(budget);
		for (const row of rows) await ctx.db.patch(row._id, { requestedByUserId: undefined });
		return { changed: rows.length, more: rows.length === budget };
	},
];

/**
 * One page of deleting a person's data, in STEPS order. Schedules the next page as soon as a
 * step stops at its budget, and deletes the users row only on a page where every step ran out
 * of rows, in the same transaction as that check.
 */
export const deleteUserDataPage = internalMutation({
	args: { userId: v.id("users") },
	returns: v.object({ changed: v.number(), isDone: v.boolean() }),
	handler: async (ctx, args) => {
		let changed = 0;
		for (const step of STEPS) {
			const result = await step(ctx, args.userId, USER_DELETION_PAGE_SIZE - changed);
			changed += result.changed;
			if (result.more || changed >= USER_DELETION_PAGE_SIZE) {
				await ctx.scheduler.runAfter(0, internal.internal.userDeletion.deleteUserDataPage, args);
				return { changed, isDone: false };
			}
		}
		if (await ctx.db.get(args.userId)) await ctx.db.delete(args.userId);
		return { changed, isDone: true };
	},
});

export const listClerkUsersPage = internalQuery({
	args: { cursor: v.union(v.string(), v.null()) },
	returns: v.object({
		clerkIds: v.array(v.string()),
		withoutClerkId: v.number(),
		continueCursor: v.string(),
		isDone: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db.query("users").paginate({ numItems: 100, cursor: args.cursor });
		const clerkIds = page.page.flatMap((user) => (user.clerkId ? [user.clerkId] : []));
		return {
			clerkIds,
			withoutClerkId: page.page.length - clerkIds.length,
			continueCursor: page.continueCursor,
			isDone: page.isDone,
		};
	},
});

/** The ids in `clerkIds` that Clerk still has. Throws on any answer it can't read. */
async function existingClerkIds(clerkIds: string[], secretKey: string): Promise<Set<string>> {
	const url = new URL("https://api.clerk.com/v1/users");
	for (const id of clerkIds) url.searchParams.append("user_id", id);
	url.searchParams.set("limit", String(clerkIds.length));
	const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
	if (!response.ok) throw new Error(`Clerk answered ${response.status}: ${await response.text()}`);
	const users: unknown = await response.json();
	if (!Array.isArray(users)) throw new Error("Clerk's user list wasn't a list");
	return new Set(users.map((user: { id?: unknown }) => String(user.id)));
}

/**
 * One-time clean-up for accounts deleted in Clerk before the app handled `user.deleted`:
 * finds users rows whose Clerk account is gone and, without `dryRun`, deletes them as the
 * webhook would. Rows without a Clerk id (email-only subscribers) are left alone. Refuses to
 * delete when Clerk has none of the accounts, which means the wrong key, not a real answer.
 */
export const deleteUsersMissingFromClerk = internalAction({
	args: { dryRun: v.boolean() },
	returns: v.object({ checked: v.number(), withoutClerkId: v.number(), missing: v.array(v.string()) }),
	handler: async (ctx, args) => {
		const secretKey = process.env.CLERK_SECRET_KEY;
		if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");

		let checked = 0;
		let withoutClerkId = 0;
		const missing: string[] = [];
		let cursor: string | null = null;
		for (;;) {
			const page: { clerkIds: string[]; withoutClerkId: number; continueCursor: string; isDone: boolean } =
				await ctx.runQuery(internal.internal.userDeletion.listClerkUsersPage, { cursor });
			withoutClerkId += page.withoutClerkId;
			if (page.clerkIds.length > 0) {
				const existing = await existingClerkIds(page.clerkIds, secretKey);
				checked += page.clerkIds.length;
				missing.push(...page.clerkIds.filter((id) => !existing.has(id)));
			}
			if (page.isDone) break;
			cursor = page.continueCursor;
		}

		const missingIds = [...new Set(missing)];
		console.log(
			`deleteUsersMissingFromClerk${args.dryRun ? " (dry run)" : ""}: checked ${checked}, without a Clerk id ${withoutClerkId}, missing ${missingIds.length}`,
		);
		if (!args.dryRun) {
			if (checked > 0 && missing.length === checked) {
				throw new Error("Clerk has none of these accounts: check CLERK_SECRET_KEY is this deployment's instance");
			}
			for (const clerkId of missingIds) {
				await ctx.runMutation(internal.internal.userDeletion.startUserDeletion, { clerkId });
			}
		}
		return { checked, withoutClerkId, missing: missingIds };
	},
});
