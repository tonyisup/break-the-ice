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

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={className}>
          {(theme != "system") && <>
            {(theme == "light") && 
              <span className="flex items-center gap-2">
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <span className="hidden sm:inline">Light</span>
              </span>
            }
            {(theme == "dark") && 
              <span className="flex items-center gap-2">
                <Moon className="h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="hidden sm:inline">Dark</span>
              </span>
            }
          </>}
          {(theme == "system") && 
            <span className="flex items-center gap-2">
              <Computer className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />
              <span className="hidden sm:inline">System</span>
            </span>
          }
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("light")}>
          <span className="flex w-full justify-between">Light <Sun /></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("dark")}>
          <span className="flex w-full justify-between">Dark <Moon /></span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setTheme("system")}>
          <span className="flex w-full justify-between">System <Computer /></span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
