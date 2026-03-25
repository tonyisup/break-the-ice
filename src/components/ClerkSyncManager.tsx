import { useEffect, useRef } from "react";
import { useAuth, useOrganization } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";

export function ClerkSyncManager() {
  const { isSignedIn, orgId, orgRole } = useAuth();
  const { organization, isLoaded } = useOrganization();
  const syncOrganization = useMutation(api.core.billing.syncOrganizationFromClerk);
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
    if (!orgId) {
      setActiveWorkspace(null);
      lastOrgKeyRef.current = null;
      return;
    }

    if (!isLoaded || !organization) {
      return;
    }

    const syncKey = `${orgId}:${organization.name}:${orgRole ?? "member"}`;
    if (lastOrgKeyRef.current === syncKey) {
      return;
    }

    lastOrgKeyRef.current = syncKey;

    void syncOrganization({
      clerkOrganizationId: orgId,
      name: organization.name,
      role: orgRole ?? undefined,
    }).then((organizationId) => {
      setActiveWorkspace(organizationId);
    }).catch(() => {
      lastOrgKeyRef.current = null;
    });
  }, [isLoaded, orgId, orgRole, organization, setActiveWorkspace, syncOrganization]);

  return null;
}
