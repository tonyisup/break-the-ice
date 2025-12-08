"use client";

import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Id } from "@/../convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace.tsx";
import { useAuth } from "@clerk/clerk-react";

const WorkspaceSwitcher = () => {
  const { has, isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return null;
  }

  if (!has({ permission: "workspace" })) {
    return null;
  }

  const organizations = useQuery(api.organizations.getOrganizations);
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();


  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-4 dark:text-white text-black">
        Active Workspace
      </h2>
      <select
        value={activeWorkspace ?? "personal"}
        onChange={(e) =>
          setActiveWorkspace(
            e.target.value === "personal"
              ? null
              : (e.target.value as Id<"organizations">)
          )
        }
        className="border rounded px-2 py-1"
      >
        <option value="personal">Personal Workspace</option>
        {organizations?.map(
          (org) =>
            org && (
              <option key={org._id} value={org._id}>
                {org.name}
              </option>
            )
        )}
      </select>
    </div>
  );
};

export default WorkspaceSwitcher;
