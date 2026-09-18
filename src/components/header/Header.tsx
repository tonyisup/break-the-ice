import { NavLink } from "react-router-dom";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Heart, History, Home } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";
import { UserMenu } from "./UserMenu";
import { TeamWorkspaceMenu } from "./TeamWorkspaceMenu";
import { useTeamWorkspace } from "@/hooks/useTeamWorkspace";

const navigation = [
  { to: "/app", label: "Home", Icon: Home },
  { to: "/liked", label: "Liked", Icon: Heart },
  { to: "/history", label: "History", Icon: History },
];

export const Header = () => {
  const { isSignedIn } = useAuth();
  const { teamWorkspaceId } = useTeamWorkspace();
  const customQuestions = useQuery(api.core.questions.getCustomQuestions,
    isSignedIn ? { organizationId: teamWorkspaceId } : "skip");
  const pendingCount = customQuestions?.filter(q => q.status === "pending").length ?? 0;
  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit } = useStorageContext();
  const likesRemaining = likedLimit - likedQuestions.length;
  const hiddenRemaining = hiddenLimit - hiddenQuestions.length;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex min-h-16 items-center justify-between gap-2 border-b border-border bg-background px-3 py-3 text-foreground md:px-6">
      <nav aria-label="Main navigation" className="flex gap-1 sm:gap-2">
        {navigation.map(({ to, label, Icon }) => (
          <div key={to} className="relative">
            <Button asChild variant="ghost" className="h-10 px-3 text-xs aria-[current=page]:bg-secondary aria-[current=page]:font-bold sm:text-sm">
              <NavLink to={to} end>
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            </Button>
            {to === "/liked" && pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground" aria-label={`${pendingCount} questions pending`}>
                {pendingCount}
              </span>
            )}
            {to === "/liked" && !isSignedIn && likesRemaining <= 3 && (
              <span className={`absolute -bottom-1 right-0 size-2 rounded-full ${likesRemaining <= 0 ? "bg-red-600" : "bg-amber-500"}`}
                title={likesRemaining <= 0 ? "Saved-question limit reached" : `${likesRemaining} saves left`} />
            )}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <TeamWorkspaceMenu className="hidden sm:inline-flex" />
        <UserMenu showSettingsBadge={!isSignedIn && hiddenRemaining <= 3}
          settingsBadgeColor={hiddenRemaining <= 0 ? "red" : "yellow"}
          settingsBadgeTitle={hiddenRemaining <= 0 ? "Hidden-question limit reached" : `${hiddenRemaining} hides left`} />
      </div>
    </header>
  );
};
