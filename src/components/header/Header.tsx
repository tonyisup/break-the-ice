import { Link } from "react-router-dom";
import { ThemeToggle } from "../ui/theme-toggle";
import { Heart, History, Settings, Home } from "lucide-react";
import { InlineSignInButton } from "../../InlineSignInButton";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";

interface HeaderProps {
  homeLinkSlot?: "liked" | "history" | "settings";
}

export const Header = ({ homeLinkSlot }: HeaderProps) => {
  const { isSignedIn } = useAuth();
  const settings = useQuery(api.users.getSettings);
  const needsMigration = (isSignedIn && settings && !settings.migratedFromLocalStorage) || (isSignedIn && !settings);

  return (
    <header className="p-4 flex justify-between items-center">
      <div className="flex gap-2">
        <HomeLink />
        {homeLinkSlot === "liked" ? (
          <HomeLink icon={<Heart className="w-5 h-5" />} text="Liked" />
        ) :
          <Button asChild>
            <Link to="/liked">
              <Heart className="w-5 h-5" /><span className="hidden sm:inline"> Liked</span>
            </Link>
          </Button>
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
            {needsMigration && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">
                !
              </div>
            )}
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
