import { Link } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated } from "convex/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Settings,
  User,
  Moon,
  Sun,
  Computer,
  LogIn,
  LogOut,
} from "@/components/ui/icons/icons";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  showSettingsBadge?: boolean;
  settingsBadgeColor?: "yellow" | "red";
  settingsBadgeTitle?: string;
}

export function UserMenu({
  showSettingsBadge,
  settingsBadgeColor,
  settingsBadgeTitle,
}: UserMenuProps) {
  const { signOut, openSignIn, openUserProfile } = useClerk();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <div className="relative">
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={
              showSettingsBadge && settingsBadgeTitle
                ? `Account menu. Hidden questions: ${settingsBadgeTitle}`
                : "Account menu"
            }
            variant="outline"
            size="icon"
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-border bg-card p-0 text-foreground hover:bg-accent"
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={user.fullName || "User"}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        {showSettingsBadge && (
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
              settingsBadgeColor === "yellow" ? "bg-amber-500" : "bg-destructive",
            )}
            title={settingsBadgeTitle}
          />
        )}
      </div>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-2xl border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-md"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold leading-none text-foreground">
              {user?.fullName || "Guest"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress || "Sign in to sync data"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <Unauthenticated>
          <DropdownMenuItem
            onClick={() => openSignIn()}
            className="min-h-10 cursor-pointer rounded-lg"
          >
            <LogIn className="mr-2 h-4 w-4" />
            <span>Sign In</span>
          </DropdownMenuItem>
        </Unauthenticated>

        <DropdownMenuItem asChild className="min-h-10 cursor-pointer rounded-lg">
          <Link to="/settings" className="flex w-full items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            {showSettingsBadge && settingsBadgeTitle && (
              <span className="ml-auto mr-2 text-xs text-muted-foreground">
                Hidden: {settingsBadgeTitle.toLowerCase()}
              </span>
            )}
            {showSettingsBadge && (
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  settingsBadgeColor === "yellow" ? "bg-amber-500" : "bg-destructive",
                )}
              />
            )}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-10 cursor-pointer rounded-lg">
            <div className="flex items-center">
              {theme === "light" && <Sun className="mr-2 h-4 w-4" />}
              {theme === "dark" && <Moon className="mr-2 h-4 w-4" />}
              {theme === "system" && <Computer className="mr-2 h-4 w-4" />}
              <span>Appearance</span>
            </div>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="rounded-xl border-border bg-popover/95 text-popover-foreground backdrop-blur-md">
              <DropdownMenuItem
                onClick={() => setTheme("light")}
                className="min-h-10 cursor-pointer rounded-lg"
              >
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
                {theme === "light" && (
                  <span className="ml-auto text-xs text-primary">●</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("dark")}
                className="min-h-10 cursor-pointer rounded-lg"
              >
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
                {theme === "dark" && (
                  <span className="ml-auto text-xs text-primary">●</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("system")}
                className="min-h-10 cursor-pointer rounded-lg"
              >
                <Computer className="mr-2 h-4 w-4" />
                <span>System</span>
                {theme === "system" && (
                  <span className="ml-auto text-xs text-primary">●</span>
                )}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <Authenticated>
          <DropdownMenuItem
            onClick={() => openUserProfile()}
            className="min-h-10 cursor-pointer rounded-lg"
          >
            <User className="mr-2 h-4 w-4" />
            <span>Manage account</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void signOut()}
            className="min-h-10 cursor-pointer rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </Authenticated>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
