import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "../ui/button";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { Heart, History } from "@/components/ui/icons/icons";
import { useStorageContext } from "@/hooks/useStorageContext";
import { UserMenu } from "./UserMenu";
import OfflineIndicator from "../OfflineIndicator";
import { BrandMark } from "../BrandMark";
import { FileQuestionMark, PencilLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

// Below this width the four destinations move to a tab bar at the bottom of the screen,
// which leaves the top bar room for the site's name.
const PHONE_QUERY = "(max-width: 639px)";

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(PHONE_QUERY).matches,
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
    const update = () =>
      root.style.setProperty(name, `${el.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === "undefined")
      return () => root.style.removeProperty(name);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(name);
    };
  }, [name, active]);
  return ref;
}

const ACTIVE =
  "aria-[current=page]:bg-foreground aria-[current=page]:text-background aria-[current=page]:hover:bg-foreground/90";

interface HeaderProps {
  /** Optional contextual action placed on the right (e.g. the feed's Filter button). */
  rightSlot?: ReactNode;
}

export const Header = ({ rightSlot }: HeaderProps) => {
  const { isSignedIn } = useAuth();
  const isPhone = useIsPhone();
  const customQuestions = useQuery(api.core.questions.getCustomQuestions, {});
  const pendingCount =
    customQuestions?.filter((q) => q.status === "pending").length ?? 0;

  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit } =
    useStorageContext();

  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  const aiLimit =
    isSignedIn &&
    currentUser &&
    typeof currentUser.aiLimit === "number" &&
    Number.isFinite(currentUser.aiLimit)
      ? currentUser.aiLimit
      : null;
  const aiLeft =
    aiLimit === null
      ? null
      : Math.max(0, aiLimit - (currentUser?.aiUsage?.count ?? 0));
  const aiLow =
    aiLeft !== null && aiLimit !== null && aiLeft <= Math.max(3, aiLimit * 0.2);

  const headerRef = usePublishedHeight<HTMLElement>("--header-h");
  const tabBarRef = usePublishedHeight<HTMLElement>("--bottom-nav-h", isPhone);

  const likesLeft = likedLimit - likedQuestions.length;
  const showLimitBadge = !isSignedIn && likesLeft <= 3 && likesLeft > 0;
  const showFullBadge = !isSignedIn && likesLeft <= 0;

  const showSettingsLimitBadge =
    !isSignedIn &&
    hiddenLimit - hiddenQuestions.length <= 3 &&
    hiddenQuestions.length < hiddenLimit;
  const showSettingsFullBadge = !isSignedIn && hiddenQuestions.length >= hiddenLimit;

  const destinations = [
    {
      to: "/app",
      end: true,
      label: "Questions",
      icon: <FileQuestionMark className="w-[18px] h-[18px]" aria-hidden="true" />,
      badge: null,
    },
    {
      to: "/liked",
      label: "Liked",
      icon: <Heart className="w-[18px] h-[18px]" aria-hidden="true" />,
      badge: showFullBadge ? (
        <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-4 text-destructive-foreground">
          Full<span className="sr-only">: guest like limit reached</span>
        </span>
      ) : showLimitBadge ? (
        <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-4 text-neutral-950">
          {likesLeft} left<span className="sr-only"> before the guest like limit</span>
        </span>
      ) : null,
    },
    {
      to: "/my-questions",
      label: "My questions",
      icon: <PencilLine className="w-[18px] h-[18px]" aria-hidden="true" />,
      badge:
        pendingCount > 0 ? (
          <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">
            {pendingCount}
            <span className="sr-only"> waiting for review</span>
          </span>
        ) : null,
    },
    {
      to: "/history",
      label: "History",
      icon: <History className="w-[18px] h-[18px]" aria-hidden="true" />,
      badge: null,
    },
  ];

  return (
    <>
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-50 flex flex-col gap-2 border-b border-border/80 bg-background/85 px-3 py-2.5 backdrop-blur-md md:px-6 md:py-3"
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
            <Link
              to="/"
              aria-label={`${siteConfig.name} home`}
              className="flex h-11 shrink-0 items-center rounded-xl pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark
                size="sm"
                labelClassName={cn(
                  "text-sm sm:text-[15px]",
                  !isPhone && "hidden lg:inline",
                )}
              />
            </Link>
            {!isPhone && (
              <nav aria-label="Main" className="flex items-center gap-1">
                {destinations.map((destination) => (
                  <Button
                    key={destination.to}
                    asChild
                    variant="ghost"
                    className="h-10 rounded-full px-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <NavLink
                      to={destination.to}
                      end={destination.end}
                      className={ACTIVE}
                    >
                      {destination.icon}
                      <span>{destination.label}</span>
                      {destination.badge}
                    </NavLink>
                  </Button>
                ))}
              </nav>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {rightSlot}

            {isSignedIn === false && (
              <SignInButton mode="modal">
                <Button
                  variant="outline"
                  className="h-10 rounded-full border-border bg-card px-4 text-sm font-semibold"
                >
                  Sign in
                </Button>
              </SignInButton>
            )}

            {aiLeft !== null && aiLimit !== null && (
              <Link
                to="/settings?expand=subscription"
                aria-label={`${aiLeft} of ${aiLimit} AI generations left this cycle. Open AI usage in Settings`}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  aiLeft === 0
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : aiLow
                      ? "border-amber-500/70 bg-amber-400/20 text-amber-900 dark:text-amber-200"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {aiLeft}
                  <span className="hidden xl:inline"> AI generations</span> left
                </span>
              </Link>
            )}

            <UserMenu
              showSettingsBadge={showSettingsLimitBadge || showSettingsFullBadge}
              settingsBadgeColor={showSettingsFullBadge ? "red" : "yellow"}
              settingsBadgeTitle={
                showSettingsFullBadge
                  ? "Limit reached"
                  : `${hiddenLimit - hiddenQuestions.length} left`
              }
            />
          </div>
        </div>
        <OfflineIndicator />
      </header>

      {/* Mobile bottom tab bar */}
      {isPhone && (
        <nav
          ref={tabBarRef}
          aria-label="Main"
          className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        >
          {destinations.map((destination) => (
            <NavLink
              key={destination.to}
              to={destination.to}
              end={destination.end}
              className="relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:text-primary"
            >
              {destination.icon}
              <span className="truncate max-w-full">{destination.label}</span>
              {destination.badge && (
                <span className="absolute right-2.5 top-1.5">{destination.badge}</span>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
};

export const HomeLink = ({
  icon = <FileQuestionMark className="w-5 h-5" aria-hidden="true" />,
  text = "Questions",
}: {
  icon?: ReactNode;
  text?: string;
}) => {
  return (
    <Button asChild variant="ghost" className="h-10 rounded-full px-3.5 text-sm">
      <NavLink to="/app" end className={ACTIVE}>
        {icon}
        <span>{text}</span>
      </NavLink>
    </Button>
  );
};
