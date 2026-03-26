"use client";

import { CreateOrganization, OrganizationProfile, SignedIn, useAuth, useOrganization } from "@clerk/clerk-react";
import { SubscriptionDetailsButton } from "@clerk/clerk-react/experimental";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import posthog from "posthog-js";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";

const OrganizationSettings = () => {
  const { isSignedIn, orgId } = useAuth();
  const { organization } = useOrganization();
  const { activeWorkspace } = useWorkspace();
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );

  useEffect(() => {
    if (orgId) {
      posthog.capture("workspace_viewed", { orgId });
    }
  }, [orgId]);

  if (!isSignedIn) {
    return null;
  }

  return (
    <CollapsibleSection title="Organization Management" isOpen={true}>
      <div className="space-y-5">
        {!orgId ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold dark:text-white text-black">
                Create your first workspace
              </h3>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Billing for teams is attached to an active organization. Create one here and then start the Team plan.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <CreateOrganization />
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
                    Active workspace
                  </p>
                  <h3 className="mt-2 text-xl font-bold dark:text-white text-black">
                    {organization?.name ?? "Workspace"}
                  </h3>
                  <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                    {entitlements?.canUseTeamFeatures
                      ? "Team billing is active. Invites and shared collections are unlocked."
                      : "This workspace is still on the free plan. Upgrade before inviting collaborators or saving shared collections."}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {entitlements?.canUseTeamFeatures ? (
                    <SubscriptionDetailsButton for="organization">
                      <Button
                        onClick={() => posthog.capture("billing_portal_opened", { payer: "organization" })}
                        className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                      >
                        Manage Team Billing
                      </Button>
                    </SubscriptionDetailsButton>
                  ) : (
                    <Button
                      asChild
                      onClick={() => posthog.capture("workspace_gate_hit", { source: "settings_organization" })}
                      className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                    >
                      <Link to="/pricing?source=workspace_gate">Upgrade to Team</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {entitlements?.canUseTeamFeatures ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
                <SignedIn>
                  <OrganizationProfile />
                </SignedIn>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-amber-400/30 bg-amber-300/10 p-5">
                <h4 className="font-semibold dark:text-white text-black">Invites unlock on Team</h4>
                <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                  Shared workspace management is gated behind the Team plan so you can keep billing and member access attached to the same organization.
                </p>
                <Button
                  asChild
                  onClick={() => posthog.capture("invite_gate_hit", { source: "settings_organization" })}
                  className="mt-4 bg-amber-400 text-slate-950 hover:bg-amber-300"
                >
                  <Link to="/pricing?source=invite_gate">Start Team Plan</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default OrganizationSettings;
