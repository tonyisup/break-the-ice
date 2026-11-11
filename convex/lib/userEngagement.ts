import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

// These rows still carry the workspace they were written in. A person's own rows have none,
// and those are the only ones read.

export async function findUserQuestion(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  questionId: Id<"questions">,
) {
  return await ctx.db
    .query("userQuestions")
    .withIndex("by_userId_organizationId_and_questionId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", undefined)
        .eq("questionId", questionId),
    )
    .first();
}

export async function findUserStyle(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  styleId: Id<"styles">,
) {
  return await ctx.db
    .query("userStyles")
    .withIndex("by_userId_organizationId_and_styleId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", undefined)
        .eq("styleId", styleId),
    )
    .first();
}

export async function findUserTone(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  toneId: Id<"tones">,
) {
  return await ctx.db
    .query("userTones")
    .withIndex("by_userId_organizationId_and_toneId", (q) =>
      q
        .eq("userId", userId)
        .eq("organizationId", undefined)
        .eq("toneId", toneId),
    )
    .first();
}
