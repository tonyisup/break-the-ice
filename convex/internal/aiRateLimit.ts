import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { checkRateLimit, rateLimit } from "../lib/aiRateLimit";

export const consumeAiRateLimit = internalMutation({
  args: {
    name: v.union(v.literal("aiRequest"), v.literal("aiRequestDaily"), v.literal("matrixFillCell")),
    key: v.string(),
    count: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean(), retryAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    // convex-helpers takes count as given: a negative or NaN count would add tokens or
    // disable the bucket for good.
    if (args.count !== undefined && (!Number.isInteger(args.count) || args.count < 1)) {
      throw new Error("Rate limit count must be a positive integer");
    }
    const { ok, retryAt } = await rateLimit(ctx, { name: args.name, key: args.key, count: args.count });
    return { ok, retryAt: retryAt ?? undefined };
  },
});

const PER_PERSON_LIMITS = ["aiRequest", "aiRequestDaily"] as const;

/** Takes one token from each per-person limit, only if both have one. */
export const consumeAiRequestLimits = internalMutation({
  args: { key: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      name: v.union(v.literal("aiRequest"), v.literal("aiRequestDaily")),
      retryAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    for (const name of PER_PERSON_LIMITS) {
      const check = await checkRateLimit(ctx, { name, key: args.key });
      if (!check.ok) return { ok: false as const, name, retryAt: check.retryAt ?? undefined };
    }
    for (const name of PER_PERSON_LIMITS) {
      await rateLimit(ctx, { name, key: args.key });
    }
    return { ok: true as const };
  },
});
