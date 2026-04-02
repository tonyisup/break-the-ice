import { Doc } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

type UserLookup = {
  tokenIdentifier?: string | null;
  clerkId?: string | null;
  email?: string | null;
};

type UserUpsert = UserLookup & {
  name?: string | null;
  image?: string | null;
};

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase();

const userScore = (user: Doc<"users">, lookup: Required<UserLookup>) => {
  const clerkMatch = lookup.clerkId && user.clerkId === lookup.clerkId ? 1 : 0;
  const emailMatch = lookup.email && normalizeEmail(user.email) === lookup.email ? 1 : 0;
  const tokenMatch =
    !clerkMatch &&
    !emailMatch &&
    lookup.tokenIdentifier &&
    user.tokenIdentifier === lookup.tokenIdentifier
      ? 1
      : 0;

  return clerkMatch * 1000 + emailMatch * 100 + tokenMatch * 10;
};

async function collectUserCandidates(ctx: QueryCtx | MutationCtx, lookup: UserLookup) {
  const normalizedEmail = normalizeEmail(lookup.email);
  const candidates = new Map<string, Doc<"users">>();

  if (lookup.tokenIdentifier) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", lookup.tokenIdentifier!))
      .collect();

    for (const user of users) {
      candidates.set(user._id, user);
    }
  }

  if (lookup.clerkId) {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", lookup.clerkId!))
      .collect();

    for (const user of users) {
      candidates.set(user._id, user);
    }
  }

  if (normalizedEmail) {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalizedEmail))
      .collect();

    for (const user of users) {
      candidates.set(user._id, user);
    }
  }

  return {
    candidates: [...candidates.values()],
    normalizedEmail,
  };
}

export async function findCanonicalUser(
  ctx: QueryCtx | MutationCtx,
  lookup: UserLookup,
) {
  const { candidates, normalizedEmail } = await collectUserCandidates(ctx, lookup);

  if (candidates.length === 0) {
    return null;
  }

  const scoredLookup = {
    tokenIdentifier: lookup.tokenIdentifier ?? "",
    clerkId: lookup.clerkId ?? "",
    email: normalizedEmail ?? "",
  };

  return candidates
    .slice()
    .sort((left, right) =>
      userScore(right, scoredLookup) - userScore(left, scoredLookup) ||
      left._creationTime - right._creationTime
    )[0] ?? null;
}

export async function getOrCreateCanonicalUser(
  ctx: MutationCtx,
  userInfo: UserUpsert,
) {
  const { candidates, normalizedEmail } = await collectUserCandidates(ctx, userInfo);
  const scoredLookup = {
    tokenIdentifier: userInfo.tokenIdentifier ?? "",
    clerkId: userInfo.clerkId ?? "",
    email: normalizedEmail ?? "",
  };

  const existingUser = candidates
    .slice()
    .sort((left, right) =>
      userScore(right, scoredLookup) - userScore(left, scoredLookup) ||
      left._creationTime - right._creationTime
    )[0] ?? null;

  if (!existingUser) {
    const userId = await ctx.db.insert("users", {
      clerkId: userInfo.clerkId ?? undefined,
      tokenIdentifier: userInfo.tokenIdentifier ?? undefined,
      email: normalizedEmail,
      name: userInfo.name ?? normalizedEmail ?? undefined,
      image: userInfo.image ?? undefined,
      billingStatus: "inactive",
      aiUsage: { count: 0, cycleStart: Date.now() },
    });

    return (await ctx.db.get(userId))!;
  }

  const patch: Partial<Doc<"users">> = {};

  if (userInfo.clerkId && existingUser.clerkId !== userInfo.clerkId) {
    patch.clerkId = userInfo.clerkId;
  }
  if (userInfo.tokenIdentifier && existingUser.tokenIdentifier !== userInfo.tokenIdentifier) {
    patch.tokenIdentifier = userInfo.tokenIdentifier;
  }
  if (normalizedEmail && normalizeEmail(existingUser.email) !== normalizedEmail) {
    patch.email = normalizedEmail;
  }
  if (userInfo.name && existingUser.name !== userInfo.name) {
    patch.name = userInfo.name;
  }
  if (userInfo.image !== undefined && existingUser.image !== userInfo.image) {
    patch.image = userInfo.image ?? undefined;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(existingUser._id, patch);
  }

  return (await ctx.db.get(existingUser._id))!;
}
