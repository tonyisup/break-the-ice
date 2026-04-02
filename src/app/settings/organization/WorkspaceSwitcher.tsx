"use client";

import { OrganizationSwitcher, useClerk, useOrganization } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

const WorkspaceSwitcher = () => {
  const { setActive } = useClerk();
  const { organization } = useOrganization();

  return (
    <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-black">
            Active Workspace
          </h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {organization ? `Currently working in ${organization.name}.` : "You are in your personal workspace."}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <OrganizationSwitcher />
          <Button
            variant="outline"
            onClick={() => void setActive({ organization: null })}
            className="border-white/15 bg-transparent"
          >
            Use personal workspace
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceSwitcher;
