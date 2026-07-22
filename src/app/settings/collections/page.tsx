"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import posthog from "posthog-js";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

const CollectionsSettings = () => {
  const { isSignedIn } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  useEffect(() => {
    const expand = searchParams.get("expand");
    const tab = searchParams.get("tab");
    const shouldExpand =
      tab === "collections" ||
      expand?.split(",").some((section) => section.trim() === "collections");
    if (shouldExpand) {
      setCollectionsOpen(true);
    }
  }, [searchParams]);
  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );
  const collections = useQuery(
    api.core.collections.getCollectionsByOrganization,
    activeWorkspace && entitlements?.canUseTeamFeatures
      ? { organizationId: activeWorkspace }
      : "skip"
  );
  const createCollection = useMutation(api.core.collections.createCollection);
  const [newCollectionName, setNewCollectionName] = useState("");

  if (!isSignedIn) {
    return null;
  }

  const handleCreateCollection = async () => {
    const normalized = newCollectionName.trim();
    if (!normalized || !activeWorkspace) {
      return;
    }

    // Wait for entitlements to load
    if (entitlements === undefined) {
      return;
    }

    if (!entitlements?.canUseTeamFeatures) {
      posthog.capture("collections_gate_hit", { source: "settings_collections" });
      return;
    }

    await createCollection({ name: normalized, organizationId: activeWorkspace });
    setNewCollectionName("");
  };

  return (
    <CollapsibleSection title="Shared Collections" isOpen={collectionsOpen} onOpenChange={setCollectionsOpen}>
      <div className="space-y-4">
        {!activeWorkspace ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Switch into an organization workspace to manage shared collections.
          </p>
        ) : (
          <>
            {collections?.map((collection) => (
              <Link
                key={collection._id}
                to={`/settings/collections/${collection._id}`}
                className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold dark:text-white text-black">
                    {collection.name}
                  </h3>
                  <span className="shrink-0 text-sm text-black/60 dark:text-white/60">
                    {collection.questionCount === 1
                      ? "1 question"
                      : `${collection.questionCount} questions`}
                  </span>
                </div>
              </Link>
            ))}

            {entitlements === undefined ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-black/60 dark:text-white/60">
                  Loading entitlements...
                </p>
              </div>
            ) : !entitlements?.canUseTeamFeatures ? (
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
              <div className="flex flex-col gap-2 items-center sm:flex-row">
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
