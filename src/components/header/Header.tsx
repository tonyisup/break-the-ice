import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Heart, History, Home } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";
import { UserMenu } from "./UserMenu";
import { TeamWorkspaceMenu } from "./TeamWorkspaceMenu";
import { useTeamWorkspace } from "@/hooks/useTeamWorkspace";

interface HeaderProps {
  homeLinkSlot?: "liked" | "history" | "settings";
}

export const Header = ({ homeLinkSlot }: HeaderProps) => {
  const { isSignedIn } = useAuth();
  const { teamWorkspaceId } = useTeamWorkspace();
  const customQuestions = useQuery(api.core.questions.getCustomQuestions, {
    organizationId: teamWorkspaceId,
  });
  const pendingCount = customQuestions?.filter((q) => q.status === "pending").length ?? 0;

  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit } = useStorageContext();

  // Show badge if we are within 3 of the limit
  const showLimitBadge = !isSignedIn && (likedLimit - likedQuestions.length <= 3) && (likedQuestions.length < likedLimit);
  const showFullBadge = !isSignedIn && (likedQuestions.length >= likedLimit);

  const showSettingsLimitBadge = !isSignedIn && (hiddenLimit - hiddenQuestions.length <= 3) && (hiddenQuestions.length < hiddenLimit);
  const showSettingsFullBadge = !isSignedIn && (hiddenQuestions.length >= hiddenLimit);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-white/10 bg-white/5 p-3 backdrop-blur-md dark:bg-black/20 md:p-4">
      <div className="flex gap-1.5 sm:gap-2">
        <HomeLink />
        {homeLinkSlot === "liked" ? (
          <HomeLink icon={<Heart className="w-5 h-5" />} text="Liked" />
        ) :
          <div className="relative">
            <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
              <Link to="/liked">
                <Heart className="w-5 h-5" />
                <span>Liked</span>
              </Link>
            </Button>
            {pendingCount > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                {pendingCount}
              </div>
            )}
            {showLimitBadge && (
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-900" title={`${likedLimit - likedQuestions.length} left`} />
            )}
            {showFullBadge && (
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900" title="Limit reached" />
            )}
          </div>
        }
        {homeLinkSlot === "history" ? (
          <HomeLink icon={<History className="w-5 h-5" />} text="History" />
        ) : (
          <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            <Link to="/history">
              <History className="w-5 h-5" />
              <span>History</span>
            </Link>
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TeamWorkspaceMenu className="hidden sm:inline-flex" />
        <UserMenu
          showSettingsBadge={showSettingsLimitBadge || showSettingsFullBadge}
          settingsBadgeColor={showSettingsFullBadge ? "red" : "yellow"}
          settingsBadgeTitle={showSettingsFullBadge ? "Limit reached" : `${hiddenLimit - hiddenQuestions.length} left`}
        />
      </div>

    </header>
  );
};

export const HomeLink = ({ icon = <Home className="w-5 h-5" />, text = "Home" }: { icon?: React.ReactNode, text?: string }) => {
  return (
    <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
      <Link to="/app">
        {icon}
        <span>{text}</span>
      </Link>
    </Button>
  );
};
