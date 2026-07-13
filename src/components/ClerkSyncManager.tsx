import { useEffect, useRef } from "react";
import { useAuth, useOrganization } from "@clerk/clerk-react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";

export function ClerkSyncManager() {
  const { isSignedIn, isLoaded: authLoaded, orgId, orgRole } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const syncOrganization = useMutation(api.core.billing.syncOrganizationFromClerk);
  const syncOrganizationViaClerkApi = useAction(api.core.billingSyncAction.syncOrganizationViaClerkApi);
  const storeUser = useMutation(api.core.users.store);
  const { workspaceHydrated, setActiveWorkspace } = useWorkspace();
  const lastOrgKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setActiveWorkspace(null);
      lastOrgKeyRef.current = null;
      return;
    }

    void storeUser();
  }, [isSignedIn, setActiveWorkspace, storeUser]);

  useEffect(() => {
    if (!authLoaded || !workspaceHydrated) return;

    if (!isSignedIn) {
      return;
    }

    if (!orgLoaded) {
      return;
    }

    if (!orgId) {
      // Once Clerk has fully loaded and no org is active, the user is in the
      // personal workspace. Clear the local workspace selection to keep both
      // sources of truth aligned.
      lastOrgKeyRef.current = null;
      setActiveWorkspace(null);
      return;
    }

    if (!organization) {
      return;
    }

    const syncKey = `${orgId}:${organization.name}:${orgRole ?? "member"}`;
    if (lastOrgKeyRef.current === syncKey) {
      return;
    }

    lastOrgKeyRef.current = syncKey;
    const currentKey = syncKey;

    void syncOrganization({})
      .then((convexOrgId) => {
        if (lastOrgKeyRef.current !== currentKey) {
          return;
        }
        if (convexOrgId) {
          setActiveWorkspace(convexOrgId);
          return;
        }
        // Convex JWT often omits org claims; verify via Clerk API (needs CLERK_SECRET_KEY in Convex).
        return syncOrganizationViaClerkApi({
          clerkOrganizationId: orgId,
          organizationName: organization.name,
        }).then((id) => {
          if (lastOrgKeyRef.current !== currentKey) {
            return;
          }
          if (id) {
            setActiveWorkspace(id);
          } else {
            lastOrgKeyRef.current = null;
            setActiveWorkspace(null);
          }
        });
      })
      .catch((error) => {
        lastOrgKeyRef.current = null;
        setActiveWorkspace(null);
        console.error("Failed to sync organization from Clerk:", error);
      });
  }, [
    authLoaded,
    isSignedIn,
    orgLoaded,
    orgId,
    orgRole,
    organization,
    setActiveWorkspace,
    syncOrganization,
    syncOrganizationViaClerkApi,
    workspaceHydrated,
  ]);

  return null;
}
