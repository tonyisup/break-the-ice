import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { isOrganizationPaid } from "../auth";

export function isQuestionPublic(question: Doc<"questions">): boolean {
	const status = question.status;
	// Duplicate retirement preserves the original public URL and content.
	return (Boolean(question.duplicateOf) && question.duplicateWasPublic === true && status === "pruned") || status === "public" || status === "approved" || status === undefined;
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
	if (isQuestionPublic(question)) return true;
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
