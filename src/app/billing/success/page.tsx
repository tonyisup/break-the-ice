import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useOrganization } from "@clerk/clerk-react";
import posthog from "posthog-js";
import { CheckCircle2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { api } from "@/../convex/_generated/api";
import { Id } from "@/../convex/_generated/dataModel";

export default function BillingSuccessPage() {
  const { orgId } = useAuth();
  const { organization, isLoaded } = useOrganization();
  const syncOrganization = useMutation(api.core.billing.syncOrganizationFromClerk);
  const [syncedOrganizationId, setSyncedOrganizationId] = useState<Id<"organizations"> | null>(null);
  const [syncError, setSyncError] = useState(false);
  const hasTrackedRef = useRef(false);
  const lastOrgKeyRef = useRef<string | null>(null);
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    syncedOrganizationId ? { organizationId: syncedOrganizationId } : "skip"
  );

  const performSync = (clerkOrganizationId: string, name: string) => {
    const syncKey = `${clerkOrganizationId}:${name}`;
    lastOrgKeyRef.current = syncKey;
    setSyncError(false);

    void syncOrganization({
      clerkOrganizationId,
      name,
      role: undefined,
    }).then((organizationId) => {
      setSyncedOrganizationId(organizationId);
      setSyncError(false);
    }).catch(() => {
      lastOrgKeyRef.current = null;
      setSyncError(true);
    });
  };

  useEffect(() => {
    if (!orgId || !isLoaded || !organization) {
      return;
    }

    // Deduplication guard to avoid concurrent duplicate mutations
    const syncKey = `${orgId}:${organization.name}`;
    if (lastOrgKeyRef.current === syncKey) {
      return;
    }

    performSync(orgId, organization.name);
  }, [isLoaded, orgId, organization, syncOrganization]);

  useEffect(() => {
    if (!entitlements?.canUseTeamFeatures || hasTrackedRef.current) {
      return;
    }

    posthog.capture("team_checkout_completed");
    hasTrackedRef.current = true;
  }, [entitlements?.canUseTeamFeatures]);

  const handleRetrySync = () => {
    if (!orgId || !organization) return;

    performSync(orgId, organization.name);
  };

  if (!entitlements?.canUseTeamFeatures) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-3xl font-black">Checking workspace billing</h1>
          <p className="mt-3 text-slate-300">
            We are waiting for Clerk billing state to sync to your workspace before showing success.
          </p>
          {syncError && (
            <p className="mt-2 text-sm text-red-400">
              Sync failed. Please try again.
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {syncError && (
              <Button onClick={handleRetrySync} className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">
                Retry Sync
              </Button>
            )}
            <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
              <Link to="/pricing?source=success_pending">Return to pricing</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">
              <Link to="/settings?expand=subscription,organization">Open settings</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-xl rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-8 text-center shadow-2xl shadow-emerald-950/30">
        <CheckCircle2 className="mx-auto size-14 text-emerald-300" />
        <h1 className="mt-6 text-3xl font-black">Team plan is live</h1>
        <p className="mt-3 text-slate-200">
          Your workspace billing is active. You can now invite collaborators and create shared collections.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-emerald-400 text-slate-950 hover:bg-emerald-300">
            <Link to="/settings?expand=subscription,organization">Open workspace settings</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">
            <Link to="/app">Return to app</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}