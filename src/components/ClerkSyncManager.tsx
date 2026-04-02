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
  const { setActiveWorkspace } = useWorkspace();
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
    if (!authLoaded) return;

    if (!isSignedIn) {
      return;
    }

    if (!orgId) {
      // Do not clear activeWorkspace here: Clerk may still be resolving the
      // session, and Convex membership / localStorage can still be valid for /org.
      lastOrgKeyRef.current = null;
      return;
    }

    if (!orgLoaded || !organization) {
      return;
    }

    const syncKey = `${orgId}:${organization.name}:${orgRole ?? "member"}`;
    if (lastOrgKeyRef.current === syncKey) {
      return;
    }

    lastOrgKeyRef.current = syncKey;

    void syncOrganization({
      name: organization.name,
    })
      .then((convexOrgId) => {
        if (convexOrgId) {
          setActiveWorkspace(convexOrgId);
          return;
        }
        // Convex JWT often omits org claims; verify via Clerk API (needs CLERK_SECRET_KEY in Convex).
        return syncOrganizationViaClerkApi({
          clerkOrganizationId: orgId,
          organizationName: organization.name,
        }).then((id) => {
          if (id) setActiveWorkspace(id);
        });
      })
      .catch(() => {
        lastOrgKeyRef.current = null;
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
  ]);

  return null;
}
