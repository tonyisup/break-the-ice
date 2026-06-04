import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants";
import { getEffectivePlanForUser } from "../auth";

const CYCLE_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

type AiUsageSnapshot = {
  count: number;
  cycleStart: number;
};

async function getAiUsageRow(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  organizationId?: Id<"organizations">,
) {
  return await ctx.db
    .query("userAiUsage")
    .withIndex("by_userId_organizationId", (q) =>
      q.eq("userId", userId).eq("organizationId", organizationId),
    )
    .unique();
}

/** Read AI usage for a workspace, migrating legacy users.aiUsage into personal row when needed. */
export async function getAiUsageForWorkspace(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  organizationId?: Id<"organizations">,
): Promise<AiUsageSnapshot> {
  const now = Date.now();
  const row = await getAiUsageRow(ctx, userId, organizationId);
  if (row) {
    if (now - row.cycleStart > CYCLE_LENGTH_MS) {
      return { count: 0, cycleStart: now };
    }
    return { count: row.count, cycleStart: row.cycleStart };
  }

  if (!organizationId) {
    const user = await ctx.db.get(userId);
    if (user?.aiUsage) {
      if (now - user.aiUsage.cycleStart > CYCLE_LENGTH_MS) {
        return { count: 0, cycleStart: now };
      }
      return user.aiUsage;
    }
  }

  return { count: 0, cycleStart: now };
}

async function ensureAiUsageRow(
  ctx: MutationCtx,
  userId: Id<"users">,
  organizationId?: Id<"organizations">,
) {
  const existing = await getAiUsageRow(ctx, userId, organizationId);
  if (existing) {
    return existing;
  }

  const snapshot = await getAiUsageForWorkspace(ctx, userId, organizationId);
  const id = await ctx.db.insert("userAiUsage", {
    userId,
    organizationId,
    count: snapshot.count,
    cycleStart: snapshot.cycleStart,
  });
  const row = await ctx.db.get(id);
  if (!row) {
    throw new Error("Failed to create AI usage row");
  }

  if (!organizationId) {
    const user = await ctx.db.get(userId);
    if (user?.aiUsage) {
      await ctx.db.patch(userId, { aiUsage: undefined });
    }
  }

  return row;
}

export async function checkAndIncrementAiUsageForWorkspace(
  ctx: MutationCtx,
  userId: Id<"users">,
  organizationId?: Id<"organizations">,
): Promise<number> {
  const now = Date.now();
  const row = await ensureAiUsageRow(ctx, userId, organizationId);

  let count = row.count;
  let cycleStart = row.cycleStart;
  if (now - cycleStart > CYCLE_LENGTH_MS) {
    count = 0;
    cycleStart = now;
  }

  const effectivePlan = await getEffectivePlanForUser(ctx, userId, organizationId);
  const limit =
    effectivePlan.planTier === "team"
      ? parseInt(process.env.MAX_TEAM_AIGEN ?? process.env.MAX_CASUAL_AIGEN ?? "100")
      : parseInt(process.env.MAX_FREE_AIGEN ?? "10");

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

  if (!organizationId) {
    await ctx.db.patch(userId, {
      aiUsage: { count: nextCount, cycleStart },
    });
  }

  return actualCount;
}

export async function decrementAiUsageForWorkspace(
  ctx: MutationCtx,
  userId: Id<"users">,
  organizationId?: Id<"organizations">,
) {
  const row = await getAiUsageRow(ctx, userId, organizationId);
  if (!row) {
    return;
  }

  const nextCount = Math.max(0, row.count - 1);
  await ctx.db.patch(row._id, {
    count: nextCount,
  });

  if (!organizationId) {
    await ctx.db.patch(userId, {
      aiUsage: {
        count: nextCount,
        cycleStart: row.cycleStart,
      },
    });
  }
}
