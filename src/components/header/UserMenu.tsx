import { Link } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated } from "convex/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings, User, Moon, Sun, Computer, LogIn, LogOut } from "@/components/ui/icons/icons";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface UserMenuProps {
	showSettingsBadge?: boolean;
	settingsBadgeColor?: "yellow" | "red";
	settingsBadgeTitle?: string;
}

export function UserMenu({ showSettingsBadge, settingsBadgeColor, settingsBadgeTitle }: UserMenuProps) {
	const { signOut, openSignIn } = useClerk();
	const { user } = useUser();
	const { theme, setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<div className="relative">
					<Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center p-0 overflow-hidden">
						{user?.imageUrl ? (
							<img src={user.imageUrl} alt={user.fullName || "User"} className="h-full w-full object-cover" />
						) : (
							<User className="h-5 w-5" />
						)}
					</Button>
					{showSettingsBadge && (
						<div
							className={cn(
								"absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900",
								settingsBadgeColor === "yellow" ? "bg-yellow-500" : "bg-red-500"
							)}
							title={settingsBadgeTitle}
						/>
					)}
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-white/10">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">{user?.fullName || "Guest"}</p>
						<p className="text-xs leading-none text-muted-foreground">
							{user?.primaryEmailAddress?.emailAddress || "Sign in to sync data"}
						</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator className="bg-white/10" />

				<Unauthenticated>
					<DropdownMenuItem onClick={() => openSignIn()} className="cursor-pointer focus:bg-white/10">
						<LogIn className="mr-2 h-4 w-4" />
						<span>Sign In</span>
					</DropdownMenuItem>
				</Unauthenticated>

				<DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
					<Link to="/settings" className="w-full flex items-center">
						<Settings className="mr-2 h-4 w-4" />
						<span>Settings</span>
						{showSettingsBadge && (
							<div
								className={cn(
									"ml-auto w-2 h-2 rounded-full",
									settingsBadgeColor === "yellow" ? "bg-yellow-500" : "bg-red-500"
								)}
							/>
						)}
					</Link>
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="cursor-pointer focus:bg-white/10">
						<div className="flex items-center">
							{theme === "light" && <Sun className="mr-2 h-4 w-4" />}
							{theme === "dark" && <Moon className="mr-2 h-4 w-4" />}
							{theme === "system" && <Computer className="mr-2 h-4 w-4" />}
							<span>Appearance</span>
						</div>
					</DropdownMenuSubTrigger>
					<DropdownMenuPortal>
						<DropdownMenuSubContent className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-white/10">
							<DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer focus:bg-white/10">
								<Sun className="mr-2 h-4 w-4" />
								<span>Light</span>
								{theme === "light" && <span className="ml-auto text-xs text-blue-500">●</span>}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer focus:bg-white/10">
								<Moon className="mr-2 h-4 w-4" />
								<span>Dark</span>
								{theme === "dark" && <span className="ml-auto text-xs text-blue-500">●</span>}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer focus:bg-white/10">
								<Computer className="mr-2 h-4 w-4" />
								<span>System</span>
								{theme === "system" && <span className="ml-auto text-xs text-blue-500">●</span>}
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuPortal>
				</DropdownMenuSub>

				<Authenticated>
					<DropdownMenuSeparator className="bg-white/10" />
					<DropdownMenuItem onClick={() => void signOut()} className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/10">
						<LogOut className="mr-2 h-4 w-4" />
						<span>Sign Out</span>
					</DropdownMenuItem>
				</Authenticated>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
