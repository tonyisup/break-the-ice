import { useCallback } from "react";
import { useClerk, useOrganization } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useWorkspace } from "./useWorkspace";

type ConvexOrganization = {
  _id: Id<"organizations">;
  name: string;
  clerkOrganizationId?: string;
};

export function useWorkspaceSwitch() {
  const { setActive } = useClerk();
  const { organization: clerkOrganization } = useOrganization();
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();
  const organizations = useQuery(api.core.organizations.getOrganizations, {}) as
    | ConvexOrganization[]
    | undefined;

  const isPersonal = !activeWorkspace;

  const switchToPersonal = useCallback(() => {
    setActiveWorkspace(null);
    void setActive({ organization: null });
  }, [setActive, setActiveWorkspace]);

  const switchToOrganization = useCallback(
    (org: ConvexOrganization) => {
      setActiveWorkspace(org._id);
      if (org.clerkOrganizationId) {
        void setActive({ organization: org.clerkOrganizationId });
      }
    },
    [setActive, setActiveWorkspace],
  );

  const activeLabel = isPersonal
    ? "Personal"
    : organizations?.find((o) => o._id === activeWorkspace)?.name ??
      clerkOrganization?.name ??
      "Organization";

  return {
    organizations,
    activeWorkspace,
    isPersonal,
    activeLabel,
    switchToPersonal,
    switchToOrganization,
  };
}
