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
import { Checkbox } from "@/components/ui/checkbox"

export default function AIModelsPage() {
	const models = useQuery(api.admin.aiModels.getModels)
	const createModel = useMutation(api.admin.aiModels.createModel)
	const updateModel = useMutation(api.admin.aiModels.updateModel)
	const deleteModel = useMutation(api.admin.aiModels.deleteModel)

	const [search, setSearch] = React.useState("")
	const [editingModel, setEditingModel] = React.useState<Doc<"aiModels"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)

	const [newModel, setNewModel] = React.useState({
		name: "",
		identifier: "",
		provider: "OpenRouter",
		isDefault: false,
	})

	const filteredModels = models?.filter(m =>
		m.name.toLowerCase().includes(search.toLowerCase()) ||
		m.identifier.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const handleCreate = async () => {
		if (!newModel.name.trim() || !newModel.identifier.trim()) {
			toast.error("Name and Identifier are required")
			return
		}
		try {
			await createModel(newModel)
			toast.success("Model created successfully")
			setIsCreateDialogOpen(false)
			setNewModel({
				name: "",
				identifier: "",
				provider: "OpenRouter",
				isDefault: false,
			})
		} catch (error) {
			toast.error("Failed to create model")
		}
	}

	const handleUpdate = async (m: Doc<"aiModels">) => {
		try {
			await updateModel({
				id: m._id,
				name: m.name,
				identifier: m.identifier,
				provider: m.provider,
				isDefault: m.isDefault,
			})
			toast.success("Model updated")
			setEditingModel(null)
		} catch (error) {
			toast.error("Failed to update model")
		}
	}

	const handleDelete = async (id: Id<"aiModels">) => {
		if (!confirm("Are you sure you want to delete this model?")) return
		try {
			await deleteModel({ id })
			toast.success("Model deleted")
		} catch (error) {
			toast.error("Failed to delete model")
		}
	}

	if (!models) {
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
					<h2 className="text-3xl font-bold tracking-tight">AI Models</h2>
					<p className="text-muted-foreground">Manage the AI models available for question generation.</p>
				</div>
				<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
					<DialogTrigger asChild>
						<Button className="gap-2">
							<Plus className="size-4" />
							Add Model
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create New Model</DialogTitle>
							<DialogDescription>Add a new AI model identifier.</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<label className="text-sm font-medium">Model Name</label>
								<Input
									placeholder="e.g. GPT-4o"
									value={newModel.name}
									onChange={e => setNewModel({ ...newModel, name: e.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<label className="text-sm font-medium">Identifier</label>
								<Input
									placeholder="e.g. openai/gpt-4o"
									value={newModel.identifier}
									onChange={e => setNewModel({ ...newModel, identifier: e.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<label className="text-sm font-medium">Provider</label>
								<Input
									placeholder="e.g. OpenRouter"
									value={newModel.provider}
									onChange={e => setNewModel({ ...newModel, provider: e.target.value })}
								/>
							</div>
							<div className="flex items-center gap-2">
								<Checkbox
									id="isDefault"
									checked={newModel.isDefault}
									onCheckedChange={(checked) => setNewModel({ ...newModel, isDefault: !!checked })}
								/>
								<label htmlFor="isDefault" className="text-sm font-medium">Set as Default</label>
							</div>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
							<Button onClick={handleCreate}>Create Model</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search models..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0"
				/>
			</div>

			<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
				<table className="w-full text-sm text-left">
					<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
						<tr>
							<th className="px-6 py-4">Name</th>
							<th className="px-6 py-4">Identifier</th>
							<th className="px-6 py-4">Provider</th>
							<th className="px-6 py-4">Status</th>
							<th className="px-6 py-4 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{filteredModels.map((model) => (
							<tr key={model._id} className="hover:bg-muted/30 transition-colors">
								<td className="px-6 py-4 font-bold">{model.name}</td>
								<td className="px-6 py-4 font-mono text-xs">{model.identifier}</td>
								<td className="px-6 py-4">{model.provider}</td>
								<td className="px-6 py-4">
									{model.isDefault && (
										<Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">Default</Badge>
									)}
								</td>
								<td className="px-6 py-4 text-right">
									<div className="flex items-center justify-end gap-1">
										<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingModel(model)}>
											<Pencil className="size-3.5" />
										</Button>
										<Button variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(model._id)}>
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
			<Dialog open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(null)}>
				<DialogContent>
					{editingModel && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Model: {editingModel.name}</DialogTitle>
								<DialogDescription>Modify model details.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid gap-2">
									<label className="text-sm font-medium">Model Name</label>
									<Input
										value={editingModel.name}
										onChange={e => setEditingModel({ ...editingModel, name: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Identifier</label>
									<Input
										value={editingModel.identifier}
										onChange={e => setEditingModel({ ...editingModel, identifier: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Provider</label>
									<Input
										value={editingModel.provider}
										onChange={e => setEditingModel({ ...editingModel, provider: e.target.value })}
									/>
								</div>
								<div className="flex items-center gap-2">
									<Checkbox
										id="editIsDefault"
										checked={editingModel.isDefault}
										onCheckedChange={(checked) => setEditingModel({ ...editingModel, isDefault: !!checked })}
									/>
									<label htmlFor="editIsDefault" className="text-sm font-medium">Set as Default</label>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingModel(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingModel)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
