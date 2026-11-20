import { useLayoutEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Heart, History, Home } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";
import { UserMenu } from "./UserMenu";
import { FileQuestionMark } from "lucide-react";

export const Header = () => {
  const { isSignedIn } = useAuth();
  const customQuestions = useQuery(api.core.questions.getCustomQuestions, {});
  const pendingCount = customQuestions?.filter((q) => q.status === "pending").length ?? 0;

  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit } = useStorageContext();
  const headerRef = useRef<HTMLElement>(null);

  // Publish the header's real height as --header-h, so content under this fixed header
  // (page padding, sticky bars) lines up exactly instead of guessing at breakpoints.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--header-h", `${el.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty("--header-h");
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, []);

  // Show badge if we are within 3 of the limit
  const showLimitBadge = !isSignedIn && (likedLimit - likedQuestions.length <= 3) && (likedQuestions.length < likedLimit);
  const showFullBadge = !isSignedIn && (likedQuestions.length >= likedLimit);

  const showSettingsLimitBadge = !isSignedIn && (hiddenLimit - hiddenQuestions.length <= 3) && (hiddenQuestions.length < hiddenLimit);
  const showSettingsFullBadge = !isSignedIn && (hiddenQuestions.length >= hiddenLimit);

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-white/10 bg-white/80 p-3 backdrop-blur-md dark:bg-gray-900/80 md:p-4">
      <div className="flex gap-1.5 sm:gap-2">
        <HomeLink />
        <div className="relative">
          <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            <NavLink to="/liked" className="aria-[current=page]:bg-white/20 aria-[current=page]:dark:bg-white/10">
              <Heart className="w-5 h-5" />
              <span>Liked</span>
            </NavLink>
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
        <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
          <NavLink to="/history" className="aria-[current=page]:bg-white/20 aria-[current=page]:dark:bg-white/10">
            <History className="w-5 h-5" />
            <span>History</span>
          </NavLink>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <UserMenu
          showSettingsBadge={showSettingsLimitBadge || showSettingsFullBadge}
          settingsBadgeColor={showSettingsFullBadge ? "red" : "yellow"}
          settingsBadgeTitle={showSettingsFullBadge ? "Limit reached" : `${hiddenLimit - hiddenQuestions.length} left`}
        />
      </div>

    </header>
  );
};

export const HomeLink = ({ icon = <FileQuestionMark className="w-5 h-5" />, text = "Questions" }: { icon?: React.ReactNode, text?: string }) => {
  return (
    <Button asChild className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
      <NavLink to="/app" end className="aria-[current=page]:bg-white/20 aria-[current=page]:dark:bg-white/10">
        {icon}
        <span>{text}</span>
      </NavLink>
    </Button>
  );
};
