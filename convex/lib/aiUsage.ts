import { getAiPlanLimit, AI_USAGE_CYCLE_MS } from "./aiPlanLimits";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";

const CYCLE_LENGTH_MS = AI_USAGE_CYCLE_MS;

type AiUsageSnapshot = {
  count: number;
  cycleStart: number;
};

async function getAiUsageRow(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userAiUsage")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Read a person's AI usage, migrating legacy users.aiUsage into their row when needed. */
export async function getAiUsage(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<AiUsageSnapshot> {
  const now = Date.now();
  const row = await getAiUsageRow(ctx, userId);
  if (row) {
    if (now - row.cycleStart > CYCLE_LENGTH_MS) {
      return { count: 0, cycleStart: now };
    }
    return { count: row.count, cycleStart: row.cycleStart };
  }

  const user = await ctx.db.get(userId);
  if (user?.aiUsage) {
    if (now - user.aiUsage.cycleStart > CYCLE_LENGTH_MS) {
      return { count: 0, cycleStart: now };
    }
    return user.aiUsage;
  }

  return { count: 0, cycleStart: now };
}

async function ensureAiUsageRow(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await getAiUsageRow(ctx, userId);
  if (existing) {
    return existing;
  }

  const snapshot = await getAiUsage(ctx, userId);
  const id = await ctx.db.insert("userAiUsage", {
    userId,
    count: snapshot.count,
    cycleStart: snapshot.cycleStart,
  });
  const row = await ctx.db.get(id);
  if (!row) {
    throw new Error("Failed to create AI usage row");
  }

  const user = await ctx.db.get(userId);
  if (user?.aiUsage) {
    await ctx.db.patch(userId, { aiUsage: undefined });
  }

  return row;
}

export async function checkAndIncrementAiUsage(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const now = Date.now();
  const row = await ensureAiUsageRow(ctx, userId);

  let count = row.count;
  let cycleStart = row.cycleStart;
  if (now - cycleStart > CYCLE_LENGTH_MS) {
    count = 0;
    cycleStart = now;
  }

  const limit = getAiPlanLimit();

  const remaining = limit - count;
  if (remaining <= 0) {
    throw new ConvexError({
      code: ERROR_CODES.AI_LIMIT_REACHED,
      message: ERROR_MESSAGES.AI_LIMIT_REACHED,
    });
  }

  const actualCount = Math.min(1, remaining);
  const nextCount = count + actualCount;

  await ctx.db.patch(row._id, {
    count: nextCount,
    cycleStart,
  });

  await ctx.db.patch(userId, {
    aiUsage: { count: nextCount, cycleStart },
  });

  return actualCount;
}

export async function decrementAiUsage(ctx: MutationCtx, userId: Id<"users">) {
  const row = await getAiUsageRow(ctx, userId);
  if (!row) {
    return;
  }

  const nextCount = Math.max(0, row.count - 1);
  await ctx.db.patch(row._id, {
    count: nextCount,
  });

  await ctx.db.patch(userId, {
    aiUsage: {
      count: nextCount,
      cycleStart: row.cycleStart,
    },
  });
}
