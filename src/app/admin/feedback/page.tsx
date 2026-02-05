"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	CheckCircle2,
	Clock,
	Archive,
	MoreHorizontal,
	UserCircle,
	ExternalLink,
	MessageSquare,
	Search,
	Filter,
	Check
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export default function FeedbackPage() {
	const allFeedback = useQuery(api.admin.feedback.getFeedback)
	const updateStatus = useMutation(api.admin.feedback.updateFeedbackStatus)

	const [search, setSearch] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const filteredFeedback = allFeedback?.filter(f => {
		const matchesSearch = f.text.toLowerCase().includes(search.toLowerCase()) ||
			f.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
			f.user?.email?.toLowerCase().includes(search.toLowerCase())
		const matchesStatus = statusFilter === "all" || f.status === statusFilter
		return matchesSearch && matchesStatus
	}) ?? []

	const handleStatusUpdate = async (id: Id<"feedback">, status: "new" | "read" | "archived") => {
		try {
			await updateStatus({ id, status })
			toast.success(`Feedback marked as ${status}`)
		} catch (error) {
			toast.error("Failed to update status")
		}
	}

	if (!allFeedback) {
		return (
			<div className="flex flex-col gap-4 animate-pulse">
				<div className="h-10 bg-muted rounded w-1/4" />
				<div className="h-64 bg-muted rounded w-full" />
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">User Feedback</h2>
					<p className="text-muted-foreground">Review and manage feedback submitted by users.</p>
				</div>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" className="gap-2">
								<Filter className="size-4" />
								{statusFilter === "all" ? "All Statuses" : statusFilter.toUpperCase()}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setStatusFilter("all")}>All Statuses</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setStatusFilter("new")}>New</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setStatusFilter("read")}>Read</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setStatusFilter("archived")}>Archived</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search feedback text, user email..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
			</div>

			<div className="grid gap-6">
				{filteredFeedback.map((item: any) => (
					<div key={item._id} className={`group relative bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 ${item.status === 'new' ? 'border-l-4 border-l-blue-500' : ''}`}>
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-3">
								{item.user?.image ? (
									<img src={item.user.image} className="size-10 rounded-full border shadow-sm" alt={item.user.name} />
								) : (
									<div className="size-10 rounded-full bg-muted flex items-center justify-center border">
										<UserCircle className="size-6 text-muted-foreground" />
									</div>
								)}
								<div>
									<h3 className="font-bold text-sm leading-none">{item.user?.name || "Unknown User"}</h3>
									<p className="text-xs text-muted-foreground mt-1">{item.user?.email || "No email provided"}</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Badge
									variant={item.status === 'new' ? 'default' : item.status === 'read' ? 'secondary' : 'outline'}
									className="uppercase text-[10px] tracking-wider"
								>
									{item.status}
								</Badge>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="size-8">
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem className="gap-2" onClick={() => handleStatusUpdate(item._id, "read")}>
											<Check className="size-3.5" /> Mark Read
										</DropdownMenuItem>
										<DropdownMenuItem className="gap-2" onClick={() => handleStatusUpdate(item._id, "archived")}>
											<Archive className="size-3.5" /> Archive
										</DropdownMenuItem>
										<DropdownMenuItem className="gap-2" onClick={() => handleStatusUpdate(item._id, "new")}>
											<Clock className="size-3.5" /> Mark New
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>

						<div className="bg-muted/30 p-4 rounded-xl border border-dashed border-muted-foreground/20 italic text-sm relative">
							<MessageSquare className="size-4 text-muted-foreground/30 absolute -top-2 -left-2 bg-background rounded-full" />
							{item.text}
						</div>

						<div className="flex items-center justify-between mt-auto pt-4 border-t text-[10px] text-muted-foreground">
							<div className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer" onClick={() => window.open(item.pageUrl, '_blank')}>
								<ExternalLink className="size-3" />
								<span className="truncate max-w-[200px]">{item.pageUrl}</span>
							</div>
							<div className="flex items-center gap-1">
								<Clock className="size-3" />
								{new Date(item._creationTime).toLocaleString()}
							</div>
						</div>
					</div>
				))}
				{filteredFeedback.length === 0 && (
					<div className="py-20 text-center space-y-2 border-2 border-dashed rounded-3xl">
						<MessageSquare className="size-12 text-muted-foreground/20 mx-auto" />
						<p className="text-lg font-medium">No feedback matches your filters</p>
						<p className="text-muted-foreground">Try adjusting your search or filter settings.</p>
					</div>
				)}
			</div>
		</div>
	)
}
