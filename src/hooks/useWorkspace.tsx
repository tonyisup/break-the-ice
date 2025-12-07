import { createContext, useContext, useState, ReactNode } from "react";
import { Id } from "@/../convex/_generated/dataModel";

type WorkspaceContextType = {
  activeWorkspace: Id<"organizations"> | null;
  setActiveWorkspace: (workspace: Id<"organizations"> | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [activeWorkspace, setActiveWorkspace] = useState<Id<"organizations"> | null>(null);

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
