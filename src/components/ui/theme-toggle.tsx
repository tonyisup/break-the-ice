import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export interface ThemeToggleProps {
	themeOverride?: "dark" | "light";
	className?: string;
}

export const ThemeToggle = ({ themeOverride, className }: ThemeToggleProps) => {
	const { theme, setTheme } = useTheme();
	
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };
  return (
    <button
      onClick={toggleTheme}
      className={cn("p-2 rounded-lg backdrop-blur-sm transition-colors", 
				themeOverride === "dark" ? "bg-white/20 hover:bg-white/30 text-white" : "",
				themeOverride === "light" ? "bg-black/20 hover:bg-black/30 text-white" : "",
				themeOverride === undefined ? "dark:bg-white/20 dark:hover:bg-white/30 dark:text-white" : "",
				className
			)}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "🌞" : "🌙"}
    </button>
  );
};