import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorkspace } from "./useWorkspace";

/**
 * Returns an organization id only when that workspace has a verified active
 * Team entitlement. Personal features can safely fall back to an undefined id.
 */
export function useTeamWorkspace() {
  const { activeWorkspace } = useWorkspace();
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip",
  );
  const isEntitlementsLoading =
    activeWorkspace !== null && entitlements === undefined;

  return {
    activeWorkspace,
    entitlements,
    isEntitlementsLoading,
    teamWorkspaceId: entitlements?.canUseTeamFeatures
      ? activeWorkspace ?? undefined
      : undefined,
  };
}
