import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Briefcase, User, Check } from "@/components/ui/icons/icons";
import { useWorkspaceSwitch } from "@/hooks/useWorkspaceSwitch";
import { cn } from "@/lib/utils";

export function WorkspaceMenuSub() {
  const {
    organizations,
    activeWorkspace,
    isPersonal,
    activeLabel,
    switchToPersonal,
    switchToOrganization,
  } = useWorkspaceSwitch();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer focus:bg-white/10">
        <div className="flex w-full items-center">
          <Briefcase className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">Workspace</span>
          <span className="ml-auto pl-2 text-xs text-muted-foreground truncate max-w-[7rem]">
            {activeLabel}
          </span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-white/10 min-w-[12rem]">
          <DropdownMenuItem
            onClick={switchToPersonal}
            className="cursor-pointer focus:bg-white/10"
          >
            <User className="mr-2 h-4 w-4" />
            <span>Personal</span>
            {isPersonal && (
              <Check className="ml-auto h-4 w-4 text-blue-500" />
            )}
          </DropdownMenuItem>
          {organizations === undefined ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              Loading workspaces…
            </DropdownMenuItem>
          ) : (
            organizations.map((org) => (
              <DropdownMenuItem
                key={org._id}
                onClick={() => switchToOrganization(org)}
                className="cursor-pointer focus:bg-white/10"
              >
                <Briefcase className={cn("mr-2 h-4 w-4 shrink-0", "opacity-70")} />
                <span className="truncate">{org.name}</span>
                {activeWorkspace === org._id && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-blue-500" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
