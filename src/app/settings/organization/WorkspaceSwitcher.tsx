"use client";

import { OrganizationSwitcher, useOrganization } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceSwitch } from "@/hooks/useWorkspaceSwitch";

const WorkspaceSwitcher = () => {
  const { organization } = useOrganization();
  const { isPersonal, activeLabel, switchToPersonal } = useWorkspaceSwitch();

  return (
    <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-black">
            Active Workspace
          </h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {isPersonal
              ? "You are in your personal workspace."
              : `Currently working in ${organization?.name ?? activeLabel}.`}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <OrganizationSwitcher />
          {!isPersonal && (
            <Button
              variant="outline"
              onClick={switchToPersonal}
              className="border-white/15 bg-transparent"
            >
              Use personal workspace
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceSwitcher;
