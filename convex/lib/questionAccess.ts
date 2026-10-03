import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { isOrganizationPaid } from "../auth";

type RetirementFields = Pick<Doc<"questions">, "status" | "prunedAt">;

/**
 * Retired by pruning or as a duplicate, so no list shows it. Older pruning set only `prunedAt`
 * and left the status as it was, so a set `prunedAt` counts too until normalizeRetiredQuestions
 * has moved those rows to "pruned". A retired duplicate can still open by link (see
 * isQuestionPublic).
 */
export function isRetiredQuestion(question: RetirementFields): boolean {
	return question.status === "pruned" || question.prunedAt !== undefined;
}

/**
 * The status and `prunedAt` a question has under isRetiredQuestion's rule, for rows written
 * before it. A row older pruning marked with only `prunedAt` is pruned. A row its author edited
 * after it was pruned (now pending or private) has gone back through review, so it isn't retired.
 */
export function normalizedRetirement(question: RetirementFields): RetirementFields {
	if (question.prunedAt === undefined || question.status === "pruned") {
		return { status: question.status, prunedAt: question.prunedAt };
	}
	if (question.status === "pending" || question.status === "private") {
		return { status: question.status, prunedAt: undefined };
	}
	return { status: "pruned", prunedAt: question.prunedAt };
}

export function isQuestionPublic(question: Doc<"questions">): boolean {
	const status = question.status;
	// Duplicate retirement preserves the original public URL and content.
	if (Boolean(question.duplicateOf) && question.duplicateWasPublic === true && status === "pruned") return true;
	return !isRetiredQuestion(question) && (status === "public" || status === "approved" || status === undefined);
}

/** A personal question, team prompt or organization question, public or not: not a library question. */
export function isUserWrittenQuestion(question: Doc<"questions">): boolean {
	return question.authorId !== undefined || question.kind !== undefined || question.organizationId !== undefined;
}

/**
 * A personal question, team prompt or organization question that isn't public. It isn't a
 * library question, so it keeps no fingerprint: generation dedupes its candidates against the
 * library's fingerprints only.
 */
export function isPrivateUserQuestion(question: Doc<"questions">): boolean {
	return isUserWrittenQuestion(question) && !isQuestionPublic(question);
}

/**
 * An AI question held for review. It is never listed anywhere shared (feed, collections,
 * email pools and team pickers only list public questions), but it is unlisted rather than
 * private: the person it was generated for gets it straight from generation, and the daily
 * email links to it, often opened signed out. Only generation sets `heldForReview`, so a
 * question an admin moved to pending stays hidden.
 */
export function isUnlistedAiQuestion(question: Doc<"questions">): boolean {
	return (
		question.heldForReview === true &&
		question.status === "pending" &&
		question.isAIGenerated === true &&
		!question.authorId &&
		!question.organizationId
	);
}

/** Anyone with the link can open it, signed in or not: public, or an AI question held for review. */
export function isReadableByLink(question: Doc<"questions">): boolean {
	return isQuestionPublic(question) || isUnlistedAiQuestion(question);
}

/**
 * Whether `userId` (or an anonymous caller, when undefined) may see this question.
 * Used by getQuestionById, getLikedQuestions, recordAnalytics, the question history
 * and the liked/hidden update and merge mutations. Some older paths (collections.ts,
 * schedules.ts) still apply their own status checks.
 */
export async function canReadQuestion(
	ctx: QueryCtx | MutationCtx,
	question: Doc<"questions">,
	userId?: Id<"users">,
): Promise<boolean> {
	if (isReadableByLink(question)) return true;
	if (!userId) return false;
	if (question.kind === "team_prompt") {
		if (!question.organizationId) return false;
		if (!(await isOrganizationPaid(ctx, question.organizationId))) return false;
		const membership = await ctx.db
			.query("organization_members")
			.withIndex("by_userId_organizationId", (q) =>
				q.eq("userId", userId).eq("organizationId", question.organizationId!),
			)
			.unique();
		if (!membership) return false;
		if (membership.role === "admin" || membership.role === "manager") return true;

		const assignments = await ctx.db
			.query("scheduledQuestions")
			.withIndex("by_question", (q) => q.eq("questionId", question._id))
			.take(50);
		for (const assignment of assignments) {
			const schedule = await ctx.db.get(assignment.scheduleId);
			if (
				schedule?.organizationId === question.organizationId &&
				(schedule.status === "published" || schedule.status === "completed")
			) {
				return true;
			}
		}
		return false;
	}
	if (!question.organizationId) return question.authorId === userId;
	if (!(await isOrganizationPaid(ctx, question.organizationId))) return false;

	const membership = await ctx.db
		.query("organization_members")
		.withIndex("by_userId_organizationId", (q) =>
			q.eq("userId", userId).eq("organizationId", question.organizationId!),
		)
		.unique();
	return membership !== null;
}

/**
 * Resolve client-supplied question ids to questions this user may read.
 * Malformed ids, ids from another deployment, missing questions and questions
 * the user cannot see are dropped, so one bad id never blocks the rest.
 */
export async function readableQuestionIds(
	ctx: QueryCtx | MutationCtx,
	rawIds: readonly string[],
	userId: Id<"users">,
): Promise<Id<"questions">[]> {
	const readable: Id<"questions">[] = [];
	const seen = new Set<string>();
	for (const raw of rawIds) {
		const id = ctx.db.normalizeId("questions", raw);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const question = await ctx.db.get(id);
		if (question && (await canReadQuestion(ctx, question, userId))) {
			readable.push(id);
		}
	}
	return readable;
}
