import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { ensureOrgMember } from "../auth";

/** Resolve workspace org id and verify membership when in org mode. */
export async function resolveWorkspaceOrganizationId(
  ctx: QueryCtx | MutationCtx,
  organizationId?: Id<"organizations">,
): Promise<Id<"organizations"> | undefined> {
  if (organizationId) {
    await ensureOrgMember(ctx, organizationId);
  }
  return organizationId;
}

export async function findUserQuestionInWorkspace(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  questionId: Id<"questions">,
  organizationId?: Id<"organizations">,
) {
  return await ctx.db
    .query("userQuestions")
    .withIndex("by_userId_organizationId_and_questionId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", organizationId)
        .eq("questionId", questionId),
    )
    .first();
}

export async function findUserStyleInWorkspace(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  styleId: Id<"styles">,
  organizationId?: Id<"organizations">,
) {
  return await ctx.db
    .query("userStyles")
    .withIndex("by_userId_organizationId_and_styleId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", organizationId)
        .eq("styleId", styleId),
    )
    .first();
}

export async function findUserToneInWorkspace(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  toneId: Id<"tones">,
  organizationId?: Id<"organizations">,
) {
  return await ctx.db
    .query("userTones")
    .withIndex("by_userId_organizationId_and_toneId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", organizationId)
        .eq("toneId", toneId),
    )
    .first();
}
