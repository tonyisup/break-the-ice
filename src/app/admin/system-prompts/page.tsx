"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Plus,
	Pencil,
	Trash2,
	Search,
	MessageSquareQuote,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { Checkbox } from "@/components/ui/checkbox"

export default function SystemPromptsPage() {
	const prompts = useQuery(api.admin.systemPrompts.getPrompts)
	const createPrompt = useMutation(api.admin.systemPrompts.createPrompt)
	const updatePrompt = useMutation(api.admin.systemPrompts.updatePrompt)
	const deletePrompt = useMutation(api.admin.systemPrompts.deletePrompt)

	const [search, setSearch] = React.useState("")
	const [editingPrompt, setEditingPrompt] = React.useState<Doc<"systemPrompts"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)

	const [newPrompt, setNewPrompt] = React.useState({
		name: "",
		content: "",
		isDefault: false,
	})

	const filteredPrompts = prompts?.filter(p =>
		p.name.toLowerCase().includes(search.toLowerCase()) ||
		p.content.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const handleCreate = async () => {
		if (!newPrompt.name.trim() || !newPrompt.content.trim()) {
			toast.error("Name and Content are required")
			return
		}
		try {
			await createPrompt(newPrompt)
			toast.success("Prompt created successfully")
			setIsCreateDialogOpen(false)
			setNewPrompt({
				name: "",
				content: "",
				isDefault: false,
			})
		} catch (error) {
			toast.error("Failed to create prompt")
		}
	}

	const handleUpdate = async (p: Doc<"systemPrompts">) => {
		try {
			await updatePrompt({
				id: p._id,
				name: p.name,
				content: p.content,
				isDefault: p.isDefault,
			})
			toast.success("Prompt updated")
			setEditingPrompt(null)
		} catch (error) {
			toast.error("Failed to update prompt")
		}
	}

	const handleDelete = async (id: Id<"systemPrompts">) => {
		if (!confirm("Are you sure you want to delete this prompt?")) return
		try {
			await deletePrompt({ id })
			toast.success("Prompt deleted")
		} catch (error) {
			toast.error("Failed to delete prompt")
		}
	}

	if (!prompts) {
		return (
			<div className="flex flex-col gap-4 animate-pulse">
				<div className="h-10 bg-muted rounded w-1/4" />
				<div className="h-64 bg-muted rounded" />
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">System Prompts</h2>
					<p className="text-muted-foreground">Define the system instructions for the AI generator.</p>
				</div>
				<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
					<DialogTrigger asChild>
						<Button className="gap-2">
							<Plus className="size-4" />
							Add Prompt
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[600px]">
						<DialogHeader>
							<DialogTitle>Create New System Prompt</DialogTitle>
							<DialogDescription>Define a new personality or set of constraints for the AI.</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<label className="text-sm font-medium">Prompt Name</label>
								<Input
									placeholder="e.g. Standard V1"
									value={newPrompt.name}
									onChange={e => setNewPrompt({ ...newPrompt, name: e.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<label className="text-sm font-medium">System Content</label>
								<Textarea
									placeholder="You are a..."
									className="min-h-[200px]"
									value={newPrompt.content}
									onChange={e => setNewPrompt({ ...newPrompt, content: e.target.value })}
								/>
							</div>
							<div className="flex items-center gap-2">
								<Checkbox
									id="isDefault"
									checked={newPrompt.isDefault}
									onCheckedChange={(checked) => setNewPrompt({ ...newPrompt, isDefault: !!checked })}
								/>
								<label htmlFor="isDefault" className="text-sm font-medium">Set as Default</label>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
							<Button onClick={handleCreate}>Create Prompt</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search prompts..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0"
				/>
			</div>

			<div className="grid grid-cols-1 gap-6">
				{filteredPrompts.map((prompt) => (
					<div key={prompt._id} className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
						<div className="flex items-start justify-between mb-4">
							<div className="flex items-center gap-3">
								<div className="p-2 rounded-lg bg-primary/10 text-primary">
									<MessageSquareQuote className="size-5" />
								</div>
								<div>
									<h3 className="font-bold text-lg flex items-center gap-2">
										{prompt.name}
										{prompt.isDefault && (
											<Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">Default</Badge>
										)}
									</h3>
								</div>
							</div>
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingPrompt(prompt)}>
									<Pencil className="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(prompt._id)}>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						</div>
						<div className="bg-muted/30 rounded-md p-4 border border-dashed text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
							{prompt.content}
						</div>
					</div>
				))}
			</div>

			{/* Edit Dialog */}
			<Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
				<DialogContent className="sm:max-w-[600px]">
					{editingPrompt && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Prompt: {editingPrompt.name}</DialogTitle>
								<DialogDescription>Modify system prompt content.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid gap-2">
									<label className="text-sm font-medium">Prompt Name</label>
									<Input
										value={editingPrompt.name}
										onChange={e => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">System Content</label>
									<Textarea
										className="min-h-[200px]"
										value={editingPrompt.content}
										onChange={e => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
									/>
								</div>
								<div className="flex items-center gap-2">
									<Checkbox
										id="editIsDefault"
										checked={editingPrompt.isDefault}
										onCheckedChange={(checked) => setEditingPrompt({ ...editingPrompt, isDefault: !!checked })}
									/>
									<label htmlFor="editIsDefault" className="text-sm font-medium">Set as Default</label>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingPrompt(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingPrompt)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
