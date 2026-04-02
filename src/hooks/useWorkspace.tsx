import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Id } from "@/../convex/_generated/dataModel";

const LS_KEY = "break-the-ice:activeWorkspace";

type WorkspaceContextType = {
  activeWorkspace: Id<"organizations"> | null;
  setActiveWorkspace: (workspace: Id<"organizations"> | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { orgId: clerkOrgId } = useAuth();
  const [activeWorkspace, _setActiveWorkspace] = useState<Id<"organizations"> | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored ? (stored as Id<"organizations">) : null;
    } catch {
      return null;
    }
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      if (activeWorkspace) {
        localStorage.setItem(LS_KEY, activeWorkspace);
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {}
  }, [activeWorkspace]);

  // DON'T clear workspace when there's no Clerk org.
  // The org might need to be selected/created on this page.
  // Only clear on explicit sign out.

  const setActiveWorkspace = (id: Id<"organizations"> | null) => {
    _setActiveWorkspace(id);
  };

  return (
    <WorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
