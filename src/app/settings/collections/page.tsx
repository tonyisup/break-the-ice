"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useState } from "react";
import { Link } from "react-router-dom";
import posthog from "posthog-js";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

const CollectionsSettings = () => {
  const { isSignedIn } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const collections = useQuery(
    api.core.collections.getCollectionsByOrganization,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );
  const createCollection = useMutation(api.core.collections.createCollection);
  const [newCollectionName, setNewCollectionName] = useState("");

  if (!isSignedIn) {
    return null;
  }

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || !activeWorkspace) {
      return;
    }

    if (!entitlements?.canUseTeamFeatures) {
      posthog.capture("collections_gate_hit", { source: "settings_collections" });
      return;
    }

    await createCollection({ name: newCollectionName, organizationId: activeWorkspace });
    setNewCollectionName("");
  };

  return (
    <CollapsibleSection title="Shared Collections" isOpen={true}>
      <div className="space-y-4">
        {!activeWorkspace ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Switch into an organization workspace to manage shared collections.
          </p>
        ) : (
          <>
            {collections?.map((collection) => (
              <div key={collection._id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-lg font-semibold dark:text-white text-black">
                  {collection.name}
                </h3>
              </div>
            ))}

            {!entitlements?.canUseTeamFeatures ? (
              <div className="rounded-3xl border border-dashed border-amber-400/30 bg-amber-300/10 p-5">
                <h3 className="font-semibold dark:text-white text-black">Collections are part of Team</h3>
                <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                  Upgrade this workspace to save shared prompt sets for your staff or facilitators.
                </p>
                <Button
                  asChild
                  onClick={() => posthog.capture("collections_gate_hit", { source: "settings_collections" })}
                  className="mt-4 bg-amber-400 text-slate-950 hover:bg-amber-300"
                >
                  <Link to="/pricing?source=collections_gate">Upgrade to Team</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="New Collection Name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                />
                <Button onClick={() => void handleCreateCollection()} className="bg-slate-900 text-white hover:bg-slate-800">
                  Create Collection
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
};

export default CollectionsSettings;
