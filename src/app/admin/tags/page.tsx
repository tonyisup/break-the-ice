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
	Tag as TagIcon,
	Tag
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

export default function TagsPage() {
	const tags = useQuery(api.core.tags.getTags)
	const createTag = useMutation(api.admin.tags.createTag)
	const updateTag = useMutation(api.admin.tags.updateTag)
	const deleteTag = useMutation(api.admin.tags.deleteTag)

	const [search, setSearch] = React.useState("")
	const [editingTag, setEditingTag] = React.useState<Doc<"tags"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)

	const [newTag, setNewTag] = React.useState({
		name: "",
		grouping: "",
		description: "",
	})

	const filteredTags = tags?.filter(t =>
		t.name.toLowerCase().includes(search.toLowerCase()) ||
		t.grouping?.toLowerCase().includes(search.toLowerCase()) ||
		t.description?.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const handleCreate = async () => {
		if (!newTag.name.trim() || !newTag.grouping.trim()) {
			toast.error("Name and Grouping are required")
			return
		}
		try {
			await createTag({
				...newTag
			})
			toast.success("Tag created successfully")
			setIsCreateDialogOpen(false)
			setNewTag({ name: "", grouping: "", description: "" })
		} catch (error) {
			toast.error("Failed to create tag")
		}
	}

	const handleUpdate = async (t: Doc<"tags">) => {
		try {
			await updateTag({
				id: t._id,
				name: t.name,
				grouping: t.grouping,
				description: t.description
			})
			toast.success("Tag updated")
			setEditingTag(null)
		} catch (error) {
			toast.error("Failed to update tag")
		}
	}

	const handleDelete = async (id: Id<"tags">) => {
		if (!confirm("Are you sure you want to delete this tag?")) return
		try {
			await deleteTag({ id })
			toast.success("Tag deleted")
		} catch (error) {
			toast.error("Failed to delete tag")
		}
	}

	if (!tags) {
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
					<h2 className="text-3xl font-bold tracking-tight">Tags</h2>
					<p className="text-muted-foreground">Categorize questions with tags and logical groupings.</p>
				</div>
				<div className="flex items-center gap-2">
					<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
						<DialogTrigger asChild>
							<Button className="gap-2">
								<Plus className="size-4" />
								Add Tag
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[500px]">
							<DialogHeader>
								<DialogTitle>Create New Tag</DialogTitle>
								<DialogDescription>Add a new tag to the global tag system.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid gap-2">
									<label className="text-sm font-medium">Tag Name</label>
									<Input
										placeholder="e.g. Work Life Balance"
										value={newTag.name}
										onChange={e => setNewTag({ ...newTag, name: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Grouping</label>
									<Input
										placeholder="e.g. Workplace"
										value={newTag.grouping}
										onChange={e => setNewTag({ ...newTag, grouping: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="Briefly describe what this tag covers..."
										value={newTag.description}
										onChange={e => setNewTag({ ...newTag, description: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
								<Button onClick={handleCreate}>Create Tag</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search tags, groupings..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
				{search && <Button variant="ghost" size="icon" className="size-6" onClick={() => setSearch("")}><X className="size-3" /></Button>}
			</div>

			<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
				<table className="w-full text-sm text-left">
					<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
						<tr>
							<th className="px-6 py-4">Name</th>
							<th className="px-6 py-4">Grouping</th>
							<th className="px-6 py-4">Description</th>
							<th className="px-6 py-4 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{filteredTags.map((tag) => (
							<tr key={tag._id} className="hover:bg-muted/30 transition-colors">
								<td className="px-6 py-4">
									<div className="flex items-center gap-2">
										<TagIcon className="size-3.5 text-blue-500" />
										<span className="font-bold">{tag.name}</span>
									</div>
								</td>
								<td className="px-6 py-4">
									<Badge variant="secondary" className="font-mono text-[10px]">{tag.grouping}</Badge>
								</td>
								<td className="px-6 py-4">
									<p className="text-xs text-muted-foreground line-clamp-1 max-w-sm">{tag.description || "—"}</p>
								</td>
								<td className="px-6 py-4 text-right">
									<div className="flex items-center justify-end gap-1">
										<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingTag(tag)}>
											<Pencil className="size-3.5" />
										</Button>
										<Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(tag._id)}>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Edit Dialog */}
			<Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
				<DialogContent className="sm:max-w-[500px]">
					{editingTag && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Tag: {editingTag.name}</DialogTitle>
								<DialogDescription>Modify tag properties.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid gap-2">
									<label className="text-sm font-medium">Tag Name</label>
									<Input
										value={editingTag.name}
										onChange={e => setEditingTag({ ...editingTag, name: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Grouping</label>
									<Input
										value={editingTag.grouping}
										onChange={e => setEditingTag({ ...editingTag, grouping: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingTag.description}
										onChange={e => setEditingTag({ ...editingTag, description: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingTag(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingTag)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
