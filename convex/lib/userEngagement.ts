import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

export async function findUserQuestion(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  questionId: Id<"questions">,
) {
  return await ctx.db
    .query("userQuestions")
    .withIndex("by_userIdAndQuestionId", (q) => q.eq("userId", userId).eq("questionId", questionId))
    .first();
}

export async function findUserStyle(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  styleId: Id<"styles">,
) {
  return await ctx.db
    .query("userStyles")
    .withIndex("by_userIdAndStyleId", (q) => q.eq("userId", userId).eq("styleId", styleId))
    .first();
}

export async function findUserTone(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  toneId: Id<"tones">,
) {
  return await ctx.db
    .query("userTones")
    .withIndex("by_userIdAndToneId", (q) => q.eq("userId", userId).eq("toneId", toneId))
    .first();
}
