import * as React from "react"
import { Moon, Sun, Computer } from "@/components/ui/icons/icons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className, showLabel = true, labelClassName }: { className?: string, showLabel?: boolean, labelClassName?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={cn("gap-2", className)} aria-label={`Theme: ${theme}`}>
          {(theme !== "system") && <>
            {(theme === "light") &&
              <>
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                {showLabel && <span className={cn("hidden sm:inline", labelClassName)}>Light</span>}
              </>
            }
            {(theme === "dark") &&
              <>
                <Moon className="h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                {showLabel && <span className={cn("hidden sm:inline", labelClassName)}>Dark</span>}
              </>
            }
          </>}
          {(theme === "system") &&
            <>
              <Computer className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
              {showLabel && <span className={cn("hidden sm:inline", labelClassName)}>System</span>}
            </>
          }
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("light")}>
          <span className="flex w-full justify-between items-center gap-2">Light <Sun /></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("dark")}>
          <span className="flex w-full justify-between items-center gap-2">Dark <Moon /></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("system")}>
          <span className="flex w-full justify-between items-center gap-2">System <Computer /></span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
