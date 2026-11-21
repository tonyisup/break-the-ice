import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { Heart, History } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";
import { UserMenu } from "./UserMenu";
import OfflineIndicator from "../OfflineIndicator";
import { FileQuestionMark, MessageCircle, PencilLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Below this width the four destinations move to a tab bar at the bottom of the screen,
// which leaves the top bar room for the site's name.
const PHONE_QUERY = "(max-width: 639px)";

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isPhone;
}

/** Publish an element's real height as a CSS variable on the page, and clear it on unmount. */
function usePublishedHeight<T extends HTMLElement>(name: string, active = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty(name, `${el.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty(name);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(name);
    };
  }, [name, active]);
  return ref;
}

const ACTIVE = "aria-[current=page]:bg-gray-900 aria-[current=page]:text-white dark:aria-[current=page]:bg-white dark:aria-[current=page]:text-gray-900";

export const Header = () => {
  const { isSignedIn } = useAuth();
  const isPhone = useIsPhone();
  const customQuestions = useQuery(api.core.questions.getCustomQuestions, {});
  const pendingCount = customQuestions?.filter((q) => q.status === "pending").length ?? 0;

  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit } = useStorageContext();

  // How many AI generations a signed-in person has left this cycle. Scrolling the feed and
  // Remix both use them, so the count is on every app page instead of appearing only once
  // they have run out. Null when it isn't known, or there is no limit.
  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  const aiLimit = isSignedIn && currentUser && typeof currentUser.aiLimit === "number" && Number.isFinite(currentUser.aiLimit)
    ? currentUser.aiLimit
    : null;
  const aiLeft = aiLimit === null ? null : Math.max(0, aiLimit - (currentUser?.aiUsage?.count ?? 0));
  const aiLow = aiLeft !== null && aiLimit !== null && aiLeft <= Math.max(3, aiLimit * 0.2);

  // Content under the fixed header (page padding, sticky bars) and above the phone tab bar
  // lines up with their measured heights instead of guessing at breakpoints.
  const headerRef = usePublishedHeight<HTMLElement>("--header-h");
  const tabBarRef = usePublishedHeight<HTMLElement>("--bottom-nav-h", isPhone);

  const likesLeft = likedLimit - likedQuestions.length;
  const showLimitBadge = !isSignedIn && likesLeft <= 3 && likesLeft > 0;
  const showFullBadge = !isSignedIn && likesLeft <= 0;

  const showSettingsLimitBadge = !isSignedIn && (hiddenLimit - hiddenQuestions.length <= 3) && (hiddenQuestions.length < hiddenLimit);
  const showSettingsFullBadge = !isSignedIn && (hiddenQuestions.length >= hiddenLimit);

  const destinations = [
    { to: "/app", end: true, label: "Questions", icon: <FileQuestionMark className="w-5 h-5" aria-hidden="true" />, badge: null },
    {
      to: "/liked",
      label: "Liked",
      icon: <Heart className="w-5 h-5" aria-hidden="true" />,
      // The guest like limit in words, so it does not depend on colour or hover.
      badge: showFullBadge ? (
        <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">Full<span className="sr-only">: guest like limit reached</span></span>
      ) : showLimitBadge ? (
        <span className="rounded-full bg-yellow-400 px-1.5 text-[10px] font-bold leading-4 text-gray-900">{likesLeft} left<span className="sr-only"> before the guest like limit</span></span>
      ) : null,
    },
    {
      to: "/my-questions",
      label: "My questions",
      icon: <PencilLine className="w-5 h-5" aria-hidden="true" />,
      badge: pendingCount > 0 ? (
        <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-4 text-white">
          {pendingCount}<span className="sr-only"> waiting for review</span>
        </span>
      ) : null,
    },
    { to: "/history", label: "History", icon: <History className="w-5 h-5" aria-hidden="true" />, badge: null },
  ];

  return (
    <>
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 border-b border-white/10 bg-white/80 px-3 py-3 backdrop-blur-md dark:bg-gray-900/80 md:p-4">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            {/* The site's name, on every app page. On a phone the destinations are in the tab
                bar, so the name always fits; on a tablet it gives way to them. */}
            <Link
              to="/"
              aria-label="Break the Ice home"
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg pr-2 text-sm font-bold tracking-tight text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white sm:text-base"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
                <MessageCircle className="size-4" />
              </span>
              <span className={cn(!isPhone && "hidden lg:inline")}>Break the Ice</span>
            </Link>
            {!isPhone && (
              <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
                {destinations.map((destination) => (
                  <Button key={destination.to} asChild className="h-11 px-3 text-sm">
                    <NavLink to={destination.to} end={destination.end} className={ACTIVE}>
                      {destination.icon}
                      <span>{destination.label}</span>
                      {destination.badge}
                    </NavLink>
                  </Button>
                ))}
              </nav>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {isSignedIn === false && (
              <SignInButton mode="modal">
                <Button className="h-11 border border-gray-900/20 px-3 text-sm font-semibold dark:border-white/30">Sign in</Button>
              </SignInButton>
            )}
            {aiLeft !== null && aiLimit !== null && (
              <Link
                to="/settings?expand=subscription"
                aria-label={`${aiLeft} of ${aiLimit} AI generations left this cycle. Open AI usage in Settings`}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  aiLeft === 0
                    ? "border-red-700 bg-red-700 text-white"
                    : aiLow
                      ? "border-amber-500 bg-amber-400 text-gray-900"
                      : "border-gray-900/20 text-gray-900 dark:border-white/30 dark:text-white",
                )}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                <span>
                  {aiLeft}
                  <span className="hidden lg:inline"> AI generations</span> left
                </span>
              </Link>
            )}
            <UserMenu
              showSettingsBadge={showSettingsLimitBadge || showSettingsFullBadge}
              settingsBadgeColor={showSettingsFullBadge ? "red" : "yellow"}
              settingsBadgeTitle={showSettingsFullBadge ? "Limit reached" : `${hiddenLimit - hiddenQuestions.length} left`}
            />
          </div>
        </div>
        <OfflineIndicator />
      </header>

      {/* On a phone the destinations are a tab bar within thumb reach. It sits outside the
          header because the header's blur would otherwise anchor it to the top. */}
      {isPhone && (
        <nav
          ref={tabBarRef}
          aria-label="Main"
          className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-white/10 dark:bg-gray-900/95"
        >
          {destinations.map((destination) => (
            <NavLink
              key={destination.to}
              to={destination.to}
              end={destination.end}
              className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 aria-[current=page]:text-indigo-700 dark:text-gray-300 dark:aria-[current=page]:text-indigo-300"
            >
              {destination.icon}
              <span>{destination.label}</span>
              {destination.badge && <span className="absolute right-2 top-1">{destination.badge}</span>}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
};

export const HomeLink = ({ icon = <FileQuestionMark className="w-5 h-5" aria-hidden="true" />, text = "Questions" }: { icon?: React.ReactNode, text?: string }) => {
  return (
    <Button asChild className="h-11 px-3 text-sm">
      <NavLink to="/app" end className={ACTIVE}>
        {icon}
        <span>{text}</span>
      </NavLink>
    </Button>
  );
};
