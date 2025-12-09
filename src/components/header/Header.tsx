import { Link } from "react-router-dom";
import { ThemeToggle } from "../ui/theme-toggle";
import { InlineSignInButton } from "../../InlineSignInButton";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Heart, History, Settings, Home } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";

interface HeaderProps {
  homeLinkSlot?: "liked" | "history" | "settings";
}

export const Header = ({ homeLinkSlot }: HeaderProps) => {
  const { isSignedIn } = useAuth();
  const customQuestions = useQuery(api.questions.getCustomQuestions, {});
  const pendingCount = customQuestions?.filter((q) => q.status === "pending").length ?? 0;

  const { likedQuestions, likedLimit } = useStorageContext();

  // Show badge if we are within 3 of the limit
  const showLimitBadge = !isSignedIn && (likedLimit - likedQuestions.length <= 3) && (likedQuestions.length < likedLimit);
  const showFullBadge = !isSignedIn && (likedQuestions.length >= likedLimit);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-between items-center backdrop-blur-md bg-white/5 dark:bg-black/20 border-b border-white/10">
      <div className="flex gap-2">
        <HomeLink />
        {homeLinkSlot === "liked" ? (
          <HomeLink icon={<Heart className="w-5 h-5" />} text="Liked" />
        ) :
          <div className="relative">
            <Button asChild>
              <Link to="/liked">
                <Heart className="w-5 h-5" /><span className="hidden sm:inline"> Liked</span>
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
          <Button asChild>
            <Link to="/history">
              <History className="w-5 h-5" /><span className="hidden sm:inline"> History</span>
            </Link>
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {homeLinkSlot === "settings" ? (
          <HomeLink icon={<Settings className="w-5 h-5" />} text="Settings" />
        ) : (
          <div className="relative">
            <Button asChild>
              <Link to="/settings">
                <Settings className="w-5 h-5" />
                <span className="hidden sm:inline"> Settings</span>
              </Link>
            </Button>
          </div>
        )}
        <ThemeToggle />
        <InlineSignInButton />
      </div>

    </header>
  );
};

export const HomeLink = ({ icon = <Home className="w-5 h-5" />, text = "Home" }: { icon?: React.ReactNode, text?: string }) => {
  return (
    <Button asChild>
      <Link to="/app">
        {icon}
        <span className="hidden sm:inline"> {text}</span>
      </Link>
    </Button>
  );
};
