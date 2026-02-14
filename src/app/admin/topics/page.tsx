"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Plus,
	MoreHorizontal,
	Pencil,
	Trash2,
	X,
	Search,
	BookOpen,
	Calendar,
	LayoutGrid,
	List,
	Smile
} from "lucide-react"
import { IconComponent, Icon } from "@/components/ui/icons/icon"
import { IconPicker } from "@/components/ui/icon-picker"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export default function TopicsPage() {
	const topics = useQuery(api.admin.topics.getTopics)
	const createTopic = useMutation(api.admin.topics.createTopic)
	const updateTopic = useMutation(api.admin.topics.updateTopic)
	const deleteTopic = useMutation(api.admin.topics.deleteTopic)

	const [search, setSearch] = React.useState("")
	const [editingTopic, setEditingTopic] = React.useState<Doc<"topics"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
	const [viewMode, setViewMode] = React.useState<"grid" | "list">("list")

	const [newTopic, setNewTopic] = React.useState({
		id: "",
		name: "",
		description: "",
		example: "",
		promptGuidanceForAI: "",
		order: 0,
		startDate: "",
		endDate: "",
		takeoverStartDate: "",
		takeoverEndDate: "",
		icon: "Smile"
	})

	const filteredTopics = topics?.filter(t =>
		t.name.toLowerCase().includes(search.toLowerCase()) ||
		t.description?.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const handleCreate = async () => {
		if (!newTopic.name.trim() || !newTopic.id.trim()) {
			toast.error("Name and ID are required")
			return
		}
		try {
			await createTopic({
				...newTopic,
				startDate: newTopic.startDate ? new Date(newTopic.startDate).getTime() : undefined,
				endDate: newTopic.endDate ? new Date(newTopic.endDate).getTime() : undefined,
				takeoverStartDate: newTopic.takeoverStartDate ? new Date(newTopic.takeoverStartDate).getTime() : undefined,
				takeoverEndDate: newTopic.takeoverEndDate ? new Date(newTopic.takeoverEndDate).getTime() : undefined,
			})
			toast.success("Topic created successfully")
			setIsCreateDialogOpen(false)
			setNewTopic({
				id: "",
				name: "",
				description: "",
				example: "",
				promptGuidanceForAI: "",
				order: (topics?.length ?? 0) + 1,
				startDate: "",
				endDate: "",
				takeoverStartDate: "",
				takeoverEndDate: "",
				icon: "Smile"
			})
		} catch (error) {
			toast.error("Failed to create topic")
		}
	}

	const handleUpdate = async (t: Doc<"topics">) => {
		try {
			await updateTopic({
				_id: t._id,
				name: t.name,
				description: t.description,
				example: t.example,
				promptGuidanceForAI: t.promptGuidanceForAI,
				order: t.order,
				startDate: t.startDate,
				endDate: t.endDate,
				takeoverStartDate: t.takeoverStartDate,
				takeoverEndDate: t.takeoverEndDate,
				icon: t.icon
			})
			toast.success("Topic updated")
			setEditingTopic(null)
		} catch (error) {
			toast.error("Failed to update topic")
		}
	}

	const handleDelete = async (id: Id<"topics">) => {
		if (!confirm("Are you sure you want to delete this topic?")) return
		try {
			await deleteTopic({ _id: id })
			toast.success("Topic deleted")
		} catch (error) {
			toast.error("Failed to delete topic")
		}
	}

	if (!topics) {
		return (
			<div className="flex flex-col gap-4 animate-pulse">
				<div className="h-10 bg-muted rounded w-1/4" />
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted rounded" />)}
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Topics</h2>
					<p className="text-muted-foreground">Manage thematic categories for ice-breaker questions.</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center border rounded-md p-1 bg-muted/50 mr-2">
						<Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setViewMode("grid")}>
							<LayoutGrid className="size-4" />
						</Button>
						<Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setViewMode("list")}>
							<List className="size-4" />
						</Button>
					</div>
					<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
						<DialogTrigger asChild>
							<Button className="gap-2">
								<Plus className="size-4" />
								Add Topic
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
							<DialogHeader>
								<DialogTitle>Create New Topic</DialogTitle>
								<DialogDescription>Define a new thematic topic for AI question generation.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Topic ID (Slug)</label>
										<Input
											placeholder="e.g. holidays"
											value={newTopic.id}
											onChange={e => setNewTopic({ ...newTopic, id: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Name</label>
										<Input
											placeholder="e.g. Holiday Season"
											value={newTopic.name}
											onChange={e => setNewTopic({ ...newTopic, name: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Start Date (Optional)</label>
										<Input
											type="date"
											value={newTopic.startDate}
											onChange={e => setNewTopic({ ...newTopic, startDate: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label htmlFor="newTopicEndDate" className="text-sm font-medium">End Date (Optional)</label>
										<Input
											id="newTopicEndDate"
											type="date"
											value={newTopic.endDate}
											onChange={e => setNewTopic({ ...newTopic, endDate: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Takeover Start (Optional)</label>
										<Input
											type="date"
											value={newTopic.takeoverStartDate}
											onChange={e => setNewTopic({ ...newTopic, takeoverStartDate: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Takeover End (Optional)</label>
										<Input
											type="date"
											value={newTopic.takeoverEndDate}
											onChange={e => setNewTopic({ ...newTopic, takeoverEndDate: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label htmlFor="newTopicIcon" className="text-sm font-medium">Icon</label>
									<IconPicker
										id="newTopicIcon"
										value={newTopic.icon}
										onChange={icon => setNewTopic({ ...newTopic, icon })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="Short summary of this topic..."
										value={newTopic.description}
										onChange={e => setNewTopic({ ...newTopic, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="Provide context for the AI when generating questions for this topic..."
										value={newTopic.promptGuidanceForAI}
										onChange={e => setNewTopic({ ...newTopic, promptGuidanceForAI: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
								<Button onClick={handleCreate}>Create Topic</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search topics..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
				{search && <Button variant="ghost" size="icon" className="size-6" onClick={() => setSearch("")}><X className="size-3" /></Button>}
			</div>

			{viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{filteredTopics.map((topic) => (
						<div key={topic._id} className="group relative bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-3">
									<div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-200">
										{topic.icon ? (
											<IconComponent icon={topic.icon as Icon} size={24} />
										) : (
											<BookOpen className="size-6" />
										)}
									</div>
									<div>
										<h3 className="font-bold text-lg">{topic.name}</h3>
										<p className="text-xs text-muted-foreground font-mono">{topic.id}</p>
									</div>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="size-8">
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem className="gap-2" onClick={() => setEditingTopic(topic)}>
											<Pencil className="size-3.5" />
											Edit Topic
										</DropdownMenuItem>
										<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(topic._id)}>
											<Trash2 className="size-3.5" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div className="space-y-2 flex-1">
								<p className="text-sm text-muted-foreground line-clamp-3">{topic.description || "No description provided."}</p>
							</div>

							{(topic.startDate || topic.endDate) && (
								<div className="flex flex-col gap-1 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded-lg">
									<div className="font-semibold uppercase tracking-wider">Sprinkle Dates</div>
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-1">
											<Calendar className="size-3" />
											{topic.startDate ? new Date(topic.startDate).toLocaleDateString() : "—"}
										</div>
										<span>to</span>
										<div className="flex items-center gap-1">
											<Calendar className="size-3" />
											{topic.endDate ? new Date(topic.endDate).toLocaleDateString() : "—"}
										</div>
									</div>
								</div>
							)}

							{(topic.takeoverStartDate || topic.takeoverEndDate) && (
								<div className="flex flex-col gap-1 text-[10px] text-white bg-purple-600/80 p-2 rounded-lg">
									<div className="font-semibold uppercase tracking-wider flex items-center gap-1">
										<Sparkles className="size-3" /> Takeover Dates
									</div>
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-1">
											<Calendar className="size-3" />
											{topic.takeoverStartDate ? new Date(topic.takeoverStartDate).toLocaleDateString() : "—"}
										</div>
										<span>to</span>
										<div className="flex items-center gap-1">
											<Calendar className="size-3" />
											{topic.takeoverEndDate ? new Date(topic.takeoverEndDate).toLocaleDateString() : "—"}
										</div>
									</div>
								</div>
							)}

							<div className="flex items-center justify-between pt-4 border-t text-[10px]">
								<Badge variant="outline" className="font-mono">ORDER: {topic.order ?? "N/A"}</Badge>
								<span className="text-muted-foreground">ID: {topic._id.slice(0, 8)}...</span>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
					<table className="w-full text-sm text-left">
						<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
							<tr>
								<th className="px-6 py-4">Topic / ID</th>
								<th className="px-6 py-4">Dates</th>
								<th className="px-6 py-4">Order</th>
								<th className="px-6 py-4 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{filteredTopics.map((topic) => (
								<tr key={topic._id} className="hover:bg-muted/30 transition-colors">
									<td className="px-6 py-4">
										<div className="flex items-center gap-3">
											<div className="p-2 rounded-lg bg-muted text-muted-foreground">
												{topic.icon ? (
													<IconComponent icon={topic.icon as Icon} size={16} />
												) : (
													<BookOpen className="size-4" />
												)}
											</div>
											<div className="flex flex-col">
												<span className="font-bold">{topic.name}</span>
												<span className="text-[10px] text-muted-foreground font-mono">{topic.id}</span>
											</div>
										</div>
									</td>
									<td className="px-6 py-4">
										<div className="text-xs text-muted-foreground flex flex-col gap-0.5">
											{(topic.startDate || topic.endDate) && (
												<div className="flex flex-col border-b pb-1 mb-1 border-muted">
													<span className="text-[8px] font-bold uppercase opacity-70">Sprinkle</span>
													<span>{topic.startDate ? new Date(topic.startDate).toLocaleDateString() : "—"} - {topic.endDate ? new Date(topic.endDate).toLocaleDateString() : "—"}</span>
												</div>
											)}
											{(topic.takeoverStartDate || topic.takeoverEndDate) && (
												<div className="flex flex-col text-purple-600 font-medium">
													<span className="text-[8px] font-bold uppercase opacity-70">Takeover</span>
													<span>{topic.takeoverStartDate ? new Date(topic.takeoverStartDate).toLocaleDateString() : "—"} - {topic.takeoverEndDate ? new Date(topic.takeoverEndDate).toLocaleDateString() : "—"}</span>
												</div>
											)}
											{!(topic.startDate || topic.endDate || topic.takeoverStartDate || topic.takeoverEndDate) && <span>—</span>}
										</div>
									</td>
									<td className="px-6 py-4">
										<Badge variant="outline" className="font-mono text-[10px]">{topic.order ?? "—"}</Badge>
									</td>
									<td className="px-6 py-4 text-right">
										<div className="flex items-center justify-end gap-1">
											<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingTopic(topic)}>
												<Pencil className="size-3.5" />
											</Button>
											<Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(topic._id)}>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Edit Dialog */}
			<Dialog open={!!editingTopic} onOpenChange={(open) => !open && setEditingTopic(null)}>
				<DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
					{editingTopic && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Topic: {editingTopic.name}</DialogTitle>
								<DialogDescription>Modify topic metadata and AI guidance.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Topic Name</label>
										<Input
											value={editingTopic.name}
											onChange={e => setEditingTopic({ ...editingTopic, name: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Order</label>
										<Input
											type="number"
											value={editingTopic.order}
											onChange={e => setEditingTopic({ ...editingTopic, order: parseInt(e.target.value) })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Start Date</label>
										<Input
											type="date"
											value={editingTopic.startDate ? new Date(editingTopic.startDate).toISOString().split('T')[0] : ""}
											onChange={e => setEditingTopic({ ...editingTopic, startDate: e.target.value ? new Date(e.target.value).getTime() : undefined })}
										/>
									</div>
									<div className="grid gap-2">
										<label htmlFor="editTopicEndDate" className="text-sm font-medium">End Date</label>
										<Input
											id="editTopicEndDate"
											type="date"
											value={editingTopic.endDate ? new Date(editingTopic.endDate).toISOString().split('T')[0] : ""}
											onChange={e => setEditingTopic({ ...editingTopic, endDate: e.target.value ? new Date(e.target.value).getTime() : undefined })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Takeover Start</label>
										<Input
											type="date"
											value={editingTopic.takeoverStartDate ? new Date(editingTopic.takeoverStartDate).toISOString().split('T')[0] : ""}
											onChange={e => setEditingTopic({ ...editingTopic, takeoverStartDate: e.target.value ? new Date(e.target.value).getTime() : undefined })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Takeover End</label>
										<Input
											type="date"
											value={editingTopic.takeoverEndDate ? new Date(editingTopic.takeoverEndDate).toISOString().split('T')[0] : ""}
											onChange={e => setEditingTopic({ ...editingTopic, takeoverEndDate: e.target.value ? new Date(e.target.value).getTime() : undefined })}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label htmlFor="editTopicIcon" className="text-sm font-medium">Icon</label>
									<IconPicker
										id="editTopicIcon"
										value={editingTopic.icon || ""}
										onChange={icon => setEditingTopic({ ...editingTopic, icon })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingTopic.description}
										onChange={e => setEditingTopic({ ...editingTopic, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingTopic.promptGuidanceForAI}
										onChange={e => setEditingTopic({ ...editingTopic, promptGuidanceForAI: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingTopic(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingTopic)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
