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
	Sparkles,
	Building2,
	Mail,
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

const navGroups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "AI Generator", url: "/admin/generator", icon: Sparkles },
      { title: "Questions", url: "/admin/questions", icon: MessageSquare },
    ],
  },
  {
    label: "Taxonomy",
    items: [
      { title: "Styles", url: "/admin/styles", icon: Palette },
      { title: "Tones", url: "/admin/tones", icon: Music },
      { title: "Topics", url: "/admin/topics", icon: Hash },
      { title: "Tags", url: "/admin/tags", icon: Tags },
    ],
  },
  {
    label: "Audience",
    items: [
      { title: "Users", url: "/admin/users", icon: User },
      { title: "Newsletter", url: "/admin/newsletter", icon: Mail },
      { title: "Organizations", url: "/admin/organizations", icon: Building2 },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { title: "Feedback", url: "/admin/feedback", icon: ShieldCheck },
      { title: "Duplicates", url: "/admin/duplicates", icon: Copy },
      { title: "Pruning", url: "/admin/prune", icon: Trash2 },
      { title: "Question Pool", url: "/admin/pool", icon: Box },
    ],
  },
]

export function AdminSidebar() {
	const location = useLocation()

	return (
		<Sidebar collapsible="icon" className="border-r border-sidebar-border">
			<SidebarHeader className="flex items-center justify-center py-5">
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
			<SidebarContent className="gap-0">
				{navGroups.map((group) => (
					<SidebarGroup key={group.label} className="py-0.5">
						<SidebarGroupLabel className="h-6 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
							{group.label}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton
											asChild
											isActive={location.pathname === item.url}
											tooltip={item.title}
							className="h-9 transition-colors max-md:h-11 group-data-[collapsible=icon]:!size-10"
										>
											<Link to={item.url} className="flex items-center gap-3" aria-current={location.pathname === item.url ? "page" : undefined}>
												<item.icon className="size-4 shrink-0" />
												<span className="font-medium">{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter className="border-t border-sidebar-border/50 p-4">
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex min-h-10 items-center gap-3 px-2 py-1.5 max-md:min-h-11 group-data-[collapsible=icon]:justify-center">
							<UserButton afterSignOutUrl="/" />
							<div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
								<span className="text-sm font-semibold">User Settings</span>
								<span className="text-xs text-muted-foreground">Manage Account</span>
							</div>
						</div>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<ThemeToggle
							className="h-10 w-full justify-start gap-3 border-none bg-transparent px-2 text-sidebar-foreground hover:bg-accent max-md:h-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0"
							labelClassName="group-data-[collapsible=icon]:hidden"
						/>
					</SidebarMenuItem>
					<Separator className="my-2 opacity-50" />
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Legacy Admin" className="h-10 hover:bg-accent max-md:h-11 group-data-[collapsible=icon]:!size-10">
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
