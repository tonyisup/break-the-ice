import * as React from "react"
import { Moon, Sun, Computer } from "lucide-react"

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
        <Button size="icon" className={className}>
          {(theme != "system") && <><Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </>}
          {(theme == "system") && <Computer className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all" />}
            <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <span className="flex w-full justify-between">Light <Sun /></span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark <Moon />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System <Computer />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
