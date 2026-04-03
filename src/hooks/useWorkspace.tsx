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
  const { userId } = useAuth();
  const [activeWorkspace, _setActiveWorkspace] = useState<Id<"organizations"> | null>(null);

  // Hydrate only after we know which Clerk user this is (avoids cross-account workspace bleed).
  useEffect(() => {
    if (!userId) {
      _setActiveWorkspace(null);
      return;
    }
    try {
      const stored = localStorage.getItem(`${LS_KEY}:${userId}`);
      _setActiveWorkspace(stored ? (stored as Id<"organizations">) : null);
    } catch {
      /* ignore localStorage errors */
      _setActiveWorkspace(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    try {
      const key = `${LS_KEY}:${userId}`;
      if (activeWorkspace) {
        localStorage.setItem(key, activeWorkspace);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* ignore localStorage errors */
      void 0;
    }
  }, [activeWorkspace, userId]);

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
