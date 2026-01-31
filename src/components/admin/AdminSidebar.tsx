import * as React from "react"
import {
	LayoutDashboard,
	MessageSquare,
	Hash,
	Palette,
	Music,
	User,
	Tags,
	Copy,
	Trash2,
	Settings,
	ShieldCheck,
	Box,
} from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarGroupContent,
} from "@/components/ui/sidebar"
import { UserButton } from "@clerk/clerk-react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Separator } from "@/components/ui/separator"

const items = [
	{
		title: "Dashboard",
		url: "/admin",
		icon: LayoutDashboard,
	},
	{
		title: "Questions",
		url: "/admin/questions",
		icon: MessageSquare,
	},
	{
		title: "Styles",
		url: "/admin/styles",
		icon: Palette,
	},
	{
		title: "Tones",
		url: "/admin/tones",
		icon: Music,
	},
	{
		title: "Topics",
		url: "/admin/topics",
		icon: Hash,
	},
	{
		title: "Tags",
		url: "/admin/tags",
		icon: Tags,
	},
	{
		title: "Users",
		url: "/admin/users",
		icon: User,
	},
	{
		title: "Feedback",
		url: "/admin/feedback",
		icon: ShieldCheck,
	},
	{
		title: "Duplicates",
		url: "/admin/duplicates",
		icon: Copy,
	},
	{
		title: "Pruning",
		url: "/admin/prune",
		icon: Trash2,
	},
	{
		title: "Question Pool",
		url: "/admin/pool",
		icon: Box,
	},
]

export function AdminSidebar() {
	const location = useLocation()

	return (
		<Sidebar collapsible="icon" className="border-r border-sidebar-border shadow-md">
			<SidebarHeader className="flex items-center justify-center py-6">
				<div className="flex items-center gap-2 px-4 w-full">
					<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg">
						<ShieldCheck className="size-4" />
					</div>
					<div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
						<span className="font-semibold text-lg">Admin Panel</span>
						<span className="text-xs text-muted-foreground">Break the Ice</span>
					</div>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
						Management
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={location.pathname === item.url}
										tooltip={item.title}
										className="hover:bg-accent transition-all duration-200"
									>
										<Link to={item.url} className="flex items-center gap-3">
											<item.icon className="size-5 shrink-0" />
											<span className="font-medium">{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-t border-sidebar-border/50 p-4">
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex items-center gap-3 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
							<UserButton afterSignOutUrl="/" />
							<div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
								<span className="text-sm font-semibold">User Settings</span>
								<span className="text-xs text-muted-foreground">Manage Account</span>
							</div>
						</div>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<ThemeToggle
							className="w-full justify-start gap-3 h-9 border-none bg-transparent hover:bg-accent text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0 px-2"
							labelClassName="group-data-[collapsible=icon]:hidden"
						/>
					</SidebarMenuItem>
					<Separator className="my-2 opacity-50" />
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Settings" className="hover:bg-accent">
							<Link to="/admin-old" className="flex items-center gap-3">
								<Settings className="size-5 shrink-0" />
								<span className="font-medium">Legacy Admin</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
