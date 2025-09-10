import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

interface PageHeaderProps {
  theme: string;
  toggleTheme: () => void;
  isColorDark: (color: string) => boolean;
  gradient: string[];
}

export const PageHeader = ({ theme, toggleTheme, isColorDark, gradient }: PageHeaderProps) => {
  return (
    <header className="p-4 flex justify-between items-center">
      <div className="flex gap-2">
        <Link
          to="/liked"
          className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
        >
          ❤️ Liked
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
        >
          ⚙️ Settings
        </Link>
        <button
          onClick={toggleTheme}
          className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
    </header>
  );
};
