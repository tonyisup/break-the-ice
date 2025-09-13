import { Link } from "react-router-dom";
import { cn, isColorDark } from "../../lib/utils";
import { ThemeToggle } from "../ui/theme-toggle";

interface HeaderProps {
  homeLinkSlot?: "liked" | "history" | "settings";
  gradient?: string[];
}

export const Header = ({ gradient = ['#667EEA', '#764BA2'], homeLinkSlot }: HeaderProps) => {
  
  return (
    <header className="p-4 flex justify-between items-center">
      <div className="flex gap-2">
        <HomeLink theme={isColorDark(gradient[0]) ? "dark" : "light"} />
        {homeLinkSlot === "liked" ? (
          <HomeLink theme={isColorDark(gradient[0]) ? "dark" : "light"} icon="❤️" text="Liked" />
        ) :
          <Link
            to="/liked"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            ❤️<span className="hidden sm:inline"> Liked</span>
          </Link>
        }
        {homeLinkSlot === "history" ? (
          <HomeLink theme={isColorDark(gradient[0]) ? "dark" : "light"} icon="📜" text="History" />
        ) : (
          <Link
            to="/history"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            📜<span className="hidden sm:inline"> History</span>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2">
        {homeLinkSlot === "settings" ? (
          <HomeLink theme={isColorDark(gradient[1]) ? "dark" : "light"} icon="⚙️" text="Settings" />
        ) : (
        <Link
            to="/settings"
            className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            ⚙️<span className="hidden sm:inline"> Settings</span>
          </Link>
        )}
        <ThemeToggle themeOverride={isColorDark(gradient[1]) ? "dark" : "light"} />
      </div>
    </header>
  );
};

export const HomeLink = ({ theme = "dark", icon = "🏠", text="Home" }: { theme: string, icon?: string, text?: string }) => {
  return (
    <Link
      to="/app"
      className={cn(theme === "dark" ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
    >
      {icon}
      <span className="hidden sm:inline"> {text}</span>
    </Link>
  );
};
