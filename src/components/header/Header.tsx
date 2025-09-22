import { Link } from "react-router-dom";
import { cn, isColorDark } from "../../lib/utils";
import { ThemeToggle } from "../ui/theme-toggle";
import { Heart, Scroll, Settings, Home } from "lucide-react";

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
          <HomeLink theme={isColorDark(gradient[0]) ? "dark" : "light"} icon={<Heart className="w-5 h-5" />} text="Liked" />
        ) :
          <Link
            to="/liked"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white flex items-center gap-2")}
          >
            <Heart className="w-5 h-5" /><span className="hidden sm:inline"> Liked</span>
          </Link>
        }
        {homeLinkSlot === "history" ? (
          <HomeLink theme={isColorDark(gradient[0]) ? "dark" : "light"} icon={<Scroll className="w-5 h-5" />} text="History" />
        ) : (
          <Link
            to="/history"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white flex items-center gap-2")}
          >
            <Scroll className="w-5 h-5" /><span className="hidden sm:inline"> History</span>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2">
        {homeLinkSlot === "settings" ? (
          <HomeLink theme={isColorDark(gradient[1]) ? "dark" : "light"} icon={<Settings className="w-5 h-5" />} text="Settings" />
        ) : (
        <Link
            to="/settings"
            className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white flex items-center gap-2")}
          >
            <Settings className="w-5 h-5" /><span className="hidden sm:inline"> Settings</span>
          </Link>
        )}
        <ThemeToggle className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")} />
      </div>
    </header>
  );
};

export const HomeLink = ({ theme = "dark", icon = <Home className="w-5 h-5" />, text = "Home" }: { theme: string, icon?: React.ReactNode, text?: string }) => {
  return (
    <Link
      to="/app"
      className={cn(theme === "dark" ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white flex items-center gap-2")}
    >
      {icon}
      <span className="hidden sm:inline"> {text}</span>
    </Link>
  );
};
