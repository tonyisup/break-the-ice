import { Briefcase, CalendarDays, Check, ChevronDown, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const TEAM_DESTINATIONS = [
  {
    to: "/org/schedule",
    label: "Weekly schedule",
    icon: CalendarDays,
  },
  {
    to: "/org/today",
    label: "Coach view",
    icon: Users,
  },
] as const;

export function TeamWorkspaceMenu({ className }: { className?: string }) {
  const { activeWorkspace } = useWorkspace();
  const location = useLocation();

  if (!activeWorkspace) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 gap-1.5 px-3 text-xs sm:h-10 sm:text-sm", className)}
          aria-label="Open team workspace navigation"
        >
          <Briefcase className="size-4" />
          <span>Team</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Team workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TEAM_DESTINATIONS.map((destination) => {
          const isCurrent = location.pathname === destination.to;
          const Icon = destination.icon;
          return (
            <DropdownMenuItem key={destination.to} asChild>
              <Link
                to={destination.to}
                className="flex w-full cursor-pointer items-center"
                aria-current={isCurrent ? "page" : undefined}
              >
                <Icon className="mr-2 size-4" />
                <span>{destination.label}</span>
                {isCurrent && <Check className="ml-auto size-4 text-blue-500" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
