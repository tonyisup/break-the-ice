"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useState } from "react";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { useWorkspace } from "@/hooks/useWorkspace.tsx";
import { useAuth } from "@clerk/clerk-react";

const CollectionsSettings = () => {
  const { has, isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return null;
  }

  if (!has({ permission: "collections" })) {
    return null;
  }
  const { activeWorkspace } = useWorkspace();
  const collections = useQuery(
    api.core.collections.getCollectionsByOrganization,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );

  const createCollection = useMutation(api.core.collections.createCollection);

  const [newCollectionName, setNewCollectionName] = useState("");

  const handleCreateCollection = async () => {
    if (newCollectionName.trim() !== "" && activeWorkspace) {
      await createCollection({ name: newCollectionName, organizationId: activeWorkspace });
      setNewCollectionName("");
    }
  };

  return (
    <CollapsibleSection title="Manage Collections" isOpen={true}>
      <div className="space-y-4">
        {collections?.map(
          (collection) =>
            collection && (
              <div key={collection._id}>
                <h3 className="text-lg font-semibold dark:text-white text-black mb-2">
                  {collection.name}
                </h3>
                {/* Questions in collection will go here */}
              </div>
            )
        )}
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="New Collection Name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <button
            onClick={handleCreateCollection}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Create Collection
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
};

export default CollectionsSettings;
