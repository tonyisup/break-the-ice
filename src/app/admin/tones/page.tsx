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
	Check,
	X,
	Music,
	Search,
	LayoutGrid,
	List
} from "lucide-react"

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
import { Icon, IconComponent } from "@/components/ui/icons/icon"
import { iconMap } from "@/components/ui/icons/icons"
import { Badge } from "@/components/ui/badge"
import { ColorPicker } from "@/components/ui/color-picker"
import { IconPicker } from "@/components/ui/icon-picker"
import { toast } from "sonner"

export default function TonesPage() {
	const tones = useQuery(api.core.tones.getTones, {})
	const createTone = useMutation(api.admin.tones.createTone)
	const updateTone = useMutation(api.admin.tones.updateTone)
	const deleteTone = useMutation(api.admin.tones.deleteTone)

	const [search, setSearch] = React.useState("")
	const [editingTone, setEditingTone] = React.useState<Doc<"tones"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
	const [viewMode, setViewMode] = React.useState<"grid" | "list">("list")

	const [newTone, setNewTone] = React.useState({
		id: "",
		name: "",
		description: "",
		color: "#10b981",
		icon: "Music",
		order: 0,
		promptGuidanceForAI: ""
	})

	const filteredTones = tones?.filter(t =>
		t.name.toLowerCase().includes(search.toLowerCase()) ||
		t.description?.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const getSafeIcon = (iconName: string): Icon => {
		return (iconName in iconMap ? iconName : "HelpCircle") as Icon
	}

	const handleCreate = async () => {
		if (!newTone.name.trim() || !newTone.id.trim()) {
			toast.error("Name and ID are required")
			return
		}
		try {
			await createTone({
				...newTone
			})
			toast.success("Tone created successfully")
			setIsCreateDialogOpen(false)
			setNewTone({
				id: "",
				name: "",
				description: "",
				color: "#10b981",
				icon: "Music",
				order: (tones?.length ?? 0) + 1,
				promptGuidanceForAI: ""
			})
		} catch (error) {
			toast.error("Failed to create tone")
		}
	}

	const handleUpdate = async (t: Doc<"tones">) => {
		try {
			await updateTone({
				_id: t._id,
				id: t.id,
				name: t.name,
				description: t.description,
				color: t.color,
				icon: t.icon,
				promptGuidanceForAI: t.promptGuidanceForAI,
				order: t.order
			})
			toast.success("Tone updated")
			setEditingTone(null)
		} catch (error) {
			toast.error("Failed to update tone")
		}
	}

	const handleDelete = async (id: Id<"tones">) => {
		if (!confirm("Are you sure you want to delete this tone? This might affect existing questions.")) return
		try {
			await deleteTone({ id })
			toast.success("Tone deleted")
		} catch (error) {
			toast.error("Failed to delete tone")
		}
	}

	if (!tones) {
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
					<h2 className="text-3xl font-bold tracking-tight">Question Tones</h2>
					<p className="text-muted-foreground">Define the emotional resonance and personality of questions.</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center border rounded-md p-1 bg-muted/50 mr-2">
						<Button
							variant={viewMode === "grid" ? "secondary" : "ghost"}
							size="icon"
							className="size-8"
							onClick={() => setViewMode("grid")}
						>
							<LayoutGrid className="size-4" />
						</Button>
						<Button
							variant={viewMode === "list" ? "secondary" : "ghost"}
							size="icon"
							className="size-8"
							onClick={() => setViewMode("list")}
						>
							<List className="size-4" />
						</Button>
					</div>
					<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
						<DialogTrigger asChild>
							<Button className="gap-2">
								<Plus className="size-4" />
								Add Tone
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
							<DialogHeader>
								<DialogTitle>Create New Tone</DialogTitle>
								<DialogDescription>Define a new emotional tone for questions.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Tone ID (Slug)</label>
										<Input
											placeholder="e.g. funny"
											value={newTone.id}
											onChange={e => setNewTone({ ...newTone, id: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Name</label>
										<Input
											placeholder="e.g. Funny & Silly"
											value={newTone.name}
											onChange={e => setNewTone({ ...newTone, name: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Visual Identity</label>
										<div className="flex items-center gap-4">
											<ColorPicker color={newTone.color} onChange={c => setNewTone({ ...newTone, color: c })} />
											<IconPicker value={newTone.icon} onChange={i => setNewTone({ ...newTone, icon: i })} />
										</div>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Order</label>
										<Input
											type="number"
											value={newTone.order}
											onChange={e => setNewTone({ ...newTone, order: parseInt(e.target.value) })}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<Input
										placeholder="Short summary of this tone"
										value={newTone.description}
										onChange={e => setNewTone({ ...newTone, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="Provide specific instructions for the LLM on how to achieve this tone..."
										value={newTone.promptGuidanceForAI}
										onChange={e => setNewTone({ ...newTone, promptGuidanceForAI: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
								<Button onClick={handleCreate}>Create Tone</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search tones..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
				{search && <Button variant="ghost" size="icon" className="size-6" onClick={() => setSearch("")}><X className="size-3" /></Button>}
			</div>

			{viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{filteredTones.map((tone) => (
						<div key={tone._id} className="group relative bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-3">
									<div
										className="p-3 rounded-xl shadow-inner border border-white/20"
										style={{ backgroundColor: `${tone.color}20`, color: tone.color }}
									>
										<IconComponent icon={getSafeIcon(tone.icon)} size={24} color={tone.color} />
									</div>
									<div>
										<h3 className="font-bold text-lg">{tone.name}</h3>
										<p className="text-xs text-muted-foreground font-mono">{tone.id}</p>
									</div>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="size-8">
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem className="gap-2" onClick={() => setEditingTone(tone)}>
											<Pencil className="size-3.5" />
											Edit Tone
										</DropdownMenuItem>
										<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(tone._id)}>
											<Trash2 className="size-3.5" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div className="space-y-2 flex-1">
								<p className="text-sm text-muted-foreground line-clamp-3">{tone.description || "No description provided."}</p>
							</div>

							<div className="flex items-center justify-between pt-4 border-t text-[10px]">
								<Badge variant="outline" className="font-mono">ORDER: {tone.order ?? "N/A"}</Badge>
								<span className="text-muted-foreground">ID: {tone._id.slice(0, 8)}...</span>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
					<table className="w-full text-sm text-left">
						<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
							<tr>
								<th className="px-6 py-4">Visual</th>
								<th className="px-6 py-4">Name / ID</th>
								<th className="px-6 py-4">Order</th>
								<th className="px-6 py-4 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{filteredTones.map((tone) => (
								<tr key={tone._id} className="hover:bg-muted/30 transition-colors">
									<td className="px-6 py-4">
										<div
											className="size-10 rounded-lg flex items-center justify-center border shadow-sm"
											style={{ backgroundColor: `${tone.color}15`, borderColor: `${tone.color}30`, color: tone.color }}
										>
											<IconComponent icon={getSafeIcon(tone.icon)} size={18} color={tone.color} />
										</div>
									</td>
									<td className="px-6 py-4">
										<div className="flex flex-col">
											<span className="font-bold">{tone.name}</span>
											<span className="text-[10px] text-muted-foreground font-mono">{tone.id}</span>
										</div>
									</td>
									<td className="px-6 py-4">
										<Badge variant="outline" className="font-mono text-[10px]">{tone.order ?? "—"}</Badge>
									</td>
									<td className="px-6 py-4 text-right">
										<div className="flex items-center justify-end gap-1">
											<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingTone(tone)}>
												<Pencil className="size-3.5" />
											</Button>
											<Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(tone._id)}>
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
			<Dialog open={!!editingTone} onOpenChange={(open) => !open && setEditingTone(null)}>
				<DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
					{editingTone && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Tone: {editingTone.name}</DialogTitle>
								<DialogDescription>Modify the properties for this emotional tone.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Tone ID (Slug)</label>
										<Input
											value={editingTone.id}
											onChange={e => setEditingTone({ ...editingTone, id: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Name</label>
										<Input
											value={editingTone.name}
											onChange={e => setEditingTone({ ...editingTone, name: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Visual Identity</label>
										<div className="flex items-center gap-4">
											<ColorPicker color={editingTone.color} onChange={c => setEditingTone({ ...editingTone, color: c })} />
											<IconPicker value={editingTone.icon} onChange={i => setEditingTone({ ...editingTone, icon: i })} />
										</div>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Order</label>
										<Input
											type="number"
											value={editingTone.order}
											onChange={e => setEditingTone({ ...editingTone, order: parseInt(e.target.value) })}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingTone.description ?? ""}
										onChange={e => setEditingTone({ ...editingTone, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingTone.promptGuidanceForAI ?? ""}
										onChange={e => setEditingTone({ ...editingTone, promptGuidanceForAI: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingTone(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingTone)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}


