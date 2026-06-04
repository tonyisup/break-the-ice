"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const CLERK_API_BASE = "https://api.clerk.com/v1";

function getClerkHeaders() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function clerkFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${CLERK_API_BASE}${path}`, {
    ...init,
    headers: { ...getClerkHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Fetch subscriptions for a Clerk organization.
 * Tries multiple Clerk API approaches since the exact endpoint varies by Clerk version.
 */
async function fetchOrgSubscriptions(clerkOrganizationId: string): Promise<any[]> {
  // Approach 1: Try the organization endpoint which may include subscription data
  try {
    const orgData = (await clerkFetch(
      `/organizations/${encodeURIComponent(clerkOrganizationId)}`
    )) as any;
    if (orgData?.subscription) return [orgData.subscription];
    if (orgData?.subscriptions) return orgData.subscriptions;
    // Some Clerk versions include subscription_items on the org
    if (orgData?.subscription_items) {
      return [{ subscriptionItems: orgData.subscription_items, status: orgData.subscription_status ?? "inactive" }];
    }
  } catch {
    // Continue to fallback
  }

  // Approach 2: Try listing subscriptions with payer filter
  try {
    const data = (await clerkFetch(
      `/subscriptions?payer_id=${encodeURIComponent(clerkOrganizationId)}&limit=100`
    )) as { data?: any[] };
    if (data.data?.length) return data.data;
  } catch {
    // Continue to fallback
  }

  // Approach 3: Try the organization's billing endpoint
  try {
    const billingData = (await clerkFetch(
      `/organizations/${encodeURIComponent(clerkOrganizationId)}/billing/subscriptions`
    )) as any;
    if (billingData) return Array.isArray(billingData) ? billingData : [billingData];
  } catch {
    // Continue to fallback
  }

  // Approach 4: List all subscriptions and filter by organization
  try {
    const data = (await clerkFetch(`/subscriptions?limit=100`)) as { data?: any[] };
    const filtered = (data.data ?? []).filter(
      (s: any) =>
        s.payer_id === clerkOrganizationId ||
        s.organization_id === clerkOrganizationId ||
        s.payer?.id === clerkOrganizationId
    );
    if (filtered.length) return filtered;
  } catch {
    // Fall through to empty
  }

  return [];
}
async function getCurrentClerkUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

/**
 * Check an organization's subscription status directly from Clerk's REST API.
 * No webhook delay — queries Clerk in real-time.
 */
export const getOrgSubscriptionStatus = action({
  args: {
    clerkOrganizationId: v.string(),
  },
  returns: v.object({
    planTier: v.union(v.literal("free"), v.literal("team")),
    billingStatus: v.union(
      v.literal("inactive"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("trialing")
    ),
    clerkCustomerId: v.optional(v.string()),
    clerkSubscriptionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await getCurrentClerkUserId(ctx);
    const subs = await fetchOrgSubscriptions(args.clerkOrganizationId);

    const activeSub = subs.find((s: any) =>
      ["active", "past_due", "trialing", "incomplete"].includes(s?.status)
    );

    if (!activeSub) {
      return {
        planTier: "free" as const,
        billingStatus: "inactive" as const,
        clerkCustomerId: undefined,
        clerkSubscriptionId: undefined,
      };
    }

    const activeItem = activeSub.subscriptionItems?.find((item: any) =>
      ["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
    );

    const isTeam =
      activeItem?.plan?.isDefault === false &&
      activeItem?.plan?.slug !== "free";

    let billingStatus: "active" | "past_due" | "trialing" | "inactive" = "inactive";
    if (activeSub.status === "active") billingStatus = "active";
    else if (activeSub.status === "past_due") billingStatus = "past_due";
    else if (
      activeSub.subscriptionItems?.some((item: any) => item?.isFreeTrial)
    ) {
      billingStatus = "trialing";
    }

    return {
      planTier: isTeam ? ("team" as const) : ("free" as const),
      billingStatus,
      clerkCustomerId: activeSub.customerId,
      clerkSubscriptionId: activeSub.id,
    };
  },
});

/**
 * Force-sync an organization's subscription status from Clerk.
 * Queries Clerk's REST API directly, then creates/updates the org in Convex.
 * This is the reliable path — no webhook dependency.
 */
export const forceSyncOrgSubscription = action({
  args: {
    clerkOrganizationId: v.string(),
    organizationName: v.optional(v.string()),
  },
  returns: v.union(v.id("organizations"), v.null()),
  handler: async (ctx, args): Promise<Id<"organizations"> | null> => {
    const clerkUserId = await getCurrentClerkUserId(ctx);

    // 1. Get subscription status directly from Clerk
    let planTier: "free" | "team" = "free";
    let billingStatus: "inactive" | "active" | "past_due" | "canceled" | "trialing" = "inactive";
    let clerkCustomerId: string | undefined;
    let clerkSubscriptionId: string | undefined;

    try {
      const subs = await fetchOrgSubscriptions(args.clerkOrganizationId);

      const activeSub = subs.find((s: any) =>
        ["active", "past_due", "trialing", "incomplete"].includes(s?.status)
      );

      if (activeSub) {
        const activeItem = activeSub.subscriptionItems?.find((item: any) =>
          ["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
        );
        planTier = activeItem?.plan?.isDefault === false ? "team" : "free";
        if (activeSub.status === "active") billingStatus = "active";
        else if (activeSub.status === "past_due") billingStatus = "past_due";
        else if (activeSub.subscriptionItems?.some((item: any) => item?.isFreeTrial)) {
          billingStatus = "trialing";
        }
        clerkCustomerId = activeSub.customerId;
        clerkSubscriptionId = activeSub.id;
      }
    } catch {
      // If we can't reach Clerk, still create the org with free tier
    }

    // 2. Get org name from Clerk if not provided
    let orgName: string = args.organizationName ?? "Team";
    if (!args.organizationName) {
      try {
        const orgData = (await clerkFetch(
          `/organizations/${encodeURIComponent(args.clerkOrganizationId)}`
        )) as any;
        orgName = orgData?.name ?? "Team";
      } catch {
        orgName = "Team";
      }
    }

    // 3. Sync to Convex
    return await ctx.runMutation(
      internal.internal.billing.forceApplyOrgSubscription,
      {
        clerkOrganizationId: args.clerkOrganizationId,
        organizationName: orgName,
        planTier,
        billingStatus,
        clerkCustomerId,
        clerkSubscriptionId,
        clerkUserId,
      }
    );
  },
});

/**
 * Admin: List all organizations with their subscription status.
 * Requires CLERK_SECRET_KEY.
 */
export const adminListOrganizations = action({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      planTier: v.union(v.literal("free"), v.literal("team")),
      billingStatus: v.union(
        v.literal("inactive"),
        v.literal("active"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("trialing")
      ),
      createdAt: v.number(),
      memberCount: v.number(),
    })
  ),
  handler: async (_ctx, args) => {
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    const data = (await clerkFetch(
      `/organizations?limit=${limit}&offset=${offset}`
    )) as { data?: Array<{ id: string; name: string; created_at: number }> };

    const orgs = data.data ?? [];

    // Fetch subscription status for each org
    const results = await Promise.all(
      orgs.map(async (org: any) => {
        try {
          const subs = await fetchOrgSubscriptions(org.id);

          const activeSub = subs.find((s: any) =>
            ["active", "past_due", "trialing", "incomplete"].includes(s?.status)
          );

          let planTier: "free" | "team" = "free";
          let billingStatus: "inactive" | "active" | "past_due" | "canceled" | "trialing" = "inactive";

          if (activeSub) {
            const activeItem = activeSub.subscriptionItems?.find((item: any) =>
              ["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
            );
            planTier = activeItem?.plan?.isDefault === false ? "team" : "free";

            if (activeSub.status === "active") billingStatus = "active";
            else if (activeSub.status === "past_due") billingStatus = "past_due";
            else if (activeSub.subscriptionItems?.some((item: any) => item?.isFreeTrial)) {
              billingStatus = "trialing";
            }
          }

          const members = (await clerkFetch(
            `/organizations/${encodeURIComponent(org.id)}/memberships?limit=100`
          )) as { total_count?: number };

          return {
            id: org.id,
            name: org.name ?? "Unnamed",
            planTier,
            billingStatus,
            createdAt: org.created_at ?? 0,
            memberCount: members.total_count ?? 0,
          };
        } catch {
          return {
            id: org.id,
            name: org.name ?? "Unnamed",
            planTier: "free" as const,
            billingStatus: "inactive" as const,
            createdAt: org.created_at ?? 0,
            memberCount: 0,
          };
        }
      })
    );

    return results;
  },
});

/**
 * Admin: Get subscription details for a specific organization.
 */
export const adminGetOrgSubscription = action({
  args: {
    clerkOrganizationId: v.string(),
  },
  returns: v.object({
    planTier: v.union(v.literal("free"), v.literal("team")),
    billingStatus: v.union(
      v.literal("inactive"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("trialing")
    ),
    subscriptions: v.array(
      v.object({
        id: v.string(),
        status: v.string(),
        planName: v.string(),
        planSlug: v.string(),
        createdAt: v.number(),
        periodStart: v.optional(v.number()),
        periodEnd: v.optional(v.number()),
      })
    ),
  }),
  handler: async (_ctx, args) => {
    // Clerk API: get organization's subscription
    // Try the organization-specific subscription endpoint first
    let subs: any[] = [];
    try {
      const orgData = (await clerkFetch(
        `/organizations/${encodeURIComponent(args.clerkOrganizationId)}`
      )) as any;
      // The org response may include subscription info
      if (orgData?.subscription) {
        subs = [orgData.subscription];
      } else if (orgData?.subscriptions) {
        subs = orgData.subscriptions;
      }
    } catch {
      // Fallback: try listing all subscriptions and filtering
      try {
        const data = (await clerkFetch(`/subscriptions?limit=100`)) as { data?: any[] };
        subs = (data.data ?? []).filter(
          (s: any) => s.payer_id === args.clerkOrganizationId || s.organization_id === args.clerkOrganizationId
        );
      } catch {
        subs = [];
      }
    }

    const activeSub = subs.find((s: any) =>
      ["active", "past_due", "trialing", "incomplete"].includes(s?.status)
    );

    let planTier: "free" | "team" = "free";
    let billingStatus: "inactive" | "active" | "past_due" | "canceled" | "trialing" = "inactive";

    if (activeSub) {
      const activeItem = activeSub.subscriptionItems?.find((item: any) =>
        ["active", "past_due", "upcoming", "incomplete"].includes(item?.status)
      );
      planTier = activeItem?.plan?.isDefault === false ? "team" : "free";

      if (activeSub.status === "active") billingStatus = "active";
      else if (activeSub.status === "past_due") billingStatus = "past_due";
      else if (activeSub.subscriptionItems?.some((item: any) => item?.isFreeTrial)) {
        billingStatus = "trialing";
      }
    }

    const subscriptions = subs.map((s: any) => {
      const item = s.subscriptionItems?.[0];
      return {
        id: s.id,
        status: s.status,
        planName: item?.plan?.name ?? "Unknown",
        planSlug: item?.plan?.slug ?? "unknown",
        createdAt: s.created_at ?? 0,
        periodStart: s.current_period_start,
        periodEnd: s.current_period_end,
      };
    });

    return { planTier, billingStatus, subscriptions };
  },
});

/**
 * Admin: Cancel an organization's subscription.
 */
export const adminCancelOrgSubscription = action({
  args: {
    clerkOrganizationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find the active subscription
    const subs = await fetchOrgSubscriptions(args.clerkOrganizationId);

    const activeSub = subs.find((s: any) =>
      ["active", "past_due", "trialing"].includes(s?.status)
    );

    if (activeSub) {
      // Cancel via Clerk API
      await clerkFetch(
        `/subscriptions/${encodeURIComponent(activeSub.id)}`,
        { method: "DELETE" }
      );
    }

    // Sync to Convex
    const identity = await ctx.auth.getUserIdentity();
    await ctx.runMutation(internal.internal.billing.forceApplyOrgSubscription, {
      clerkOrganizationId: args.clerkOrganizationId,
      organizationName: "Team",
      planTier: "free",
      billingStatus: "canceled",
      clerkCustomerId: undefined,
      clerkSubscriptionId: activeSub?.id,
      clerkUserId: identity?.subject ?? "unknown",
    });

    return null;
  },
});
