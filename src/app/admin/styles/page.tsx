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
	Palette,
	Search,
	ChevronDown,
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

export default function StylesPage() {
	const styles = useQuery(api.core.styles.getStyles, {})
	const createStyle = useMutation(api.admin.styles.createStyle)
	const updateStyle = useMutation(api.admin.styles.updateStyle)
	const deleteStyle = useMutation(api.admin.styles.deleteStyle)

	const [search, setSearch] = React.useState("")
	const [editingStyle, setEditingStyle] = React.useState<Doc<"styles"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
	const [viewMode, setViewMode] = React.useState<"grid" | "list">("list")

	const [newStyle, setNewStyle] = React.useState({
		id: "",
		name: "",
		description: "",
		structure: "",
		color: "#6366f1",
		icon: "Sparkles",
		order: 0,
		promptGuidanceForAI: "",
		example: ""
	})

	const filteredStyles = styles?.filter(s =>
		s.name.toLowerCase().includes(search.toLowerCase()) ||
		s.description?.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const getSafeIcon = (iconName: string): Icon => {
		return (iconName in iconMap ? iconName : "HelpCircle") as Icon
	}

	const handleCreate = async () => {
		if (!newStyle.name.trim() || !newStyle.id.trim()) {
			toast.error("Name and ID are required")
			return
		}
		try {
			await createStyle({
				...newStyle,
				example: newStyle.example || undefined
			})
			toast.success("Style created successfully")
			setIsCreateDialogOpen(false)
			setNewStyle({
				id: "",
				name: "",
				description: "",
				structure: "",
				color: "#6366f1",
				icon: "Sparkles",
				order: (styles?.length ?? 0) + 1,
				promptGuidanceForAI: "",
				example: ""
			})
		} catch (error) {
			toast.error("Failed to create style")
		}
	}

	const handleUpdate = async (s: Doc<"styles">) => {
		try {
			await updateStyle({
				_id: s._id,
				id: s.id,
				name: s.name,
				description: s.description,
				structure: s.structure,
				color: s.color,
				icon: s.icon,
				promptGuidanceForAI: s.promptGuidanceForAI,
				order: s.order,
				example: s.example || undefined
			})
			toast.success("Style updated")
			setEditingStyle(null)
		} catch (error) {
			toast.error("Failed to update style")
		}
	}

	const handleDelete = async (id: Id<"styles">) => {
		if (!confirm("Are you sure you want to delete this style? This might affect existing questions.")) return
		try {
			await deleteStyle({ id })
			toast.success("Style deleted")
		} catch (error) {
			toast.error("Failed to delete style")
		}
	}

	if (!styles) {
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
					<h2 className="text-3xl font-bold tracking-tight">Question Styles</h2>
					<p className="text-muted-foreground">Define the structure and aesthetic of different question types.</p>
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
								Add Style
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
							<DialogHeader>
								<DialogTitle>Create New Style</DialogTitle>
								<DialogDescription>Define a new style for questions including its visual identity and AI guidance.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Style ID (Slug)</label>
										<Input
											placeholder="e.g. open-ended"
											value={newStyle.id}
											onChange={e => setNewStyle({ ...newStyle, id: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Name</label>
										<Input
											placeholder="e.g. Open Ended"
											value={newStyle.name}
											onChange={e => setNewStyle({ ...newStyle, name: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Visual Identity</label>
										<div className="flex items-center gap-4">
											<ColorPicker color={newStyle.color} onChange={c => setNewStyle({ ...newStyle, color: c })} />
											<IconPicker value={newStyle.icon} onChange={i => setNewStyle({ ...newStyle, icon: i })} />
										</div>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Order</label>
										<Input
											type="number"
											value={newStyle.order}
											onChange={e => {
												const parsed = Number(e.target.value);
												setNewStyle({ ...newStyle, order: Number.isFinite(parsed) ? parsed : 0 });
											}}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<Input
										placeholder="Short summary of this style"
										value={newStyle.description}
										onChange={e => setNewStyle({ ...newStyle, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Structural Instruction</label>
									<textarea
										className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="e.g. Start with 'What is your...' or 'Tell me about...'"
										value={newStyle.structure}
										onChange={e => setNewStyle({ ...newStyle, structure: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="Provide specific instructions for the LLM..."
										value={newStyle.promptGuidanceForAI}
										onChange={e => setNewStyle({ ...newStyle, promptGuidanceForAI: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Example Question</label>
									<textarea
										className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										placeholder="A sample question in this style..."
										value={newStyle.example}
										onChange={e => setNewStyle({ ...newStyle, example: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
								<Button onClick={handleCreate}>Create Style</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search styles..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
				{search && <Button variant="ghost" size="icon" className="size-6" onClick={() => setSearch("")}><X className="size-3" /></Button>}
			</div>

			{viewMode === "grid" ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{filteredStyles.map((style) => (
						<div key={style._id} className="group relative bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-3">
									<div
										className="p-3 rounded-xl shadow-inner border border-white/20"
										style={{ backgroundColor: `${style.color}20`, color: style.color }}
									>
										<IconComponent icon={getSafeIcon(style.icon)} size={24} color={style.color} />
									</div>
									<div>
										<h3 className="font-bold text-lg">{style.name}</h3>
										<p className="text-xs text-muted-foreground font-mono">{style.id}</p>
									</div>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="size-8">
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem className="gap-2" onClick={() => setEditingStyle(style)}>
											<Pencil className="size-3.5" />
											Edit Style
										</DropdownMenuItem>
										<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(style._id)}>
											<Trash2 className="size-3.5" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div className="space-y-3 flex-1">
								<p className="text-sm text-muted-foreground line-clamp-2">{style.description || "No description provided."}</p>
								<div className="space-y-1">
									<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Structure</p>
									<p className="text-xs italic bg-muted/30 p-2 rounded-md border border-dashed">{style.structure || "No specific structure."}</p>
								</div>
							</div>

							<div className="flex items-center justify-between pt-4 border-t text-[10px]">
								<Badge variant="outline" className="font-mono">ORDER: {style.order ?? "N/A"}</Badge>
								<span className="text-muted-foreground">ID: {style._id.slice(0, 8)}...</span>
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
								<th className="px-6 py-4">Structure</th>
								<th className="px-6 py-4">Order</th>
								<th className="px-6 py-4 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{filteredStyles.map((style) => (
								<tr key={style._id} className="hover:bg-muted/30 transition-colors">
									<td className="px-6 py-4">
										<div
											className="size-10 rounded-lg flex items-center justify-center border shadow-sm"
											style={{ backgroundColor: `${style.color}15`, borderColor: `${style.color}30`, color: style.color }}
										>
											<IconComponent icon={getSafeIcon(style.icon)} size={18} color={style.color} />
										</div>
									</td>
									<td className="px-6 py-4">
										<div className="flex flex-col">
											<span className="font-bold">{style.name}</span>
											<span className="text-[10px] text-muted-foreground font-mono">{style.id}</span>
										</div>
									</td>
									<td className="px-6 py-4">
										<p className="text-xs text-muted-foreground italic line-clamp-1 max-w-xs">{style.structure || "—"}</p>
									</td>
									<td className="px-6 py-4">
										<Badge variant="outline" className="font-mono text-[10px]">{style.order ?? "—"}</Badge>
									</td>
									<td className="px-6 py-4 text-right">
										<div className="flex items-center justify-end gap-1">
											<Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingStyle(style)}>
												<Pencil className="size-3.5" />
											</Button>
											<Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(style._id)}>
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
			<Dialog open={!!editingStyle} onOpenChange={(open) => !open && setEditingStyle(null)}>
				<DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
					{editingStyle && (
						<>
							<DialogHeader>
								<DialogTitle>Edit Style: {editingStyle.name}</DialogTitle>
								<DialogDescription>Modify the properties for this question style.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-6 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Style ID (Slug)</label>
										<Input
											value={editingStyle.id}
											onChange={e => setEditingStyle({ ...editingStyle, id: e.target.value })}
										/>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Name</label>
										<Input
											value={editingStyle.name}
											onChange={e => setEditingStyle({ ...editingStyle, name: e.target.value })}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Visual Identity</label>
										<div className="flex items-center gap-4">
											<ColorPicker color={editingStyle.color} onChange={c => setEditingStyle({ ...editingStyle, color: c })} />
											<IconPicker value={editingStyle.icon} onChange={i => setEditingStyle({ ...editingStyle, icon: i })} />
										</div>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Display Order</label>
										<Input
											type="number"
											value={editingStyle.order}
											onChange={e => {
												const parsed = Number(e.target.value);
												setEditingStyle({ ...editingStyle, order: Number.isFinite(parsed) ? parsed : 0 });
											}}
										/>
									</div>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Description</label>
									<textarea
										className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingStyle.description ?? ""}
										onChange={e => setEditingStyle({ ...editingStyle, description: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">Structural Instruction</label>
									<textarea
										className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingStyle.structure ?? ""}
										onChange={e => setEditingStyle({ ...editingStyle, structure: e.target.value })}
									/>
								</div>
								<div className="grid gap-2">
									<label className="text-sm font-medium">AI Guidance</label>
									<textarea
										className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										value={editingStyle.promptGuidanceForAI ?? ""}
										onChange={e => setEditingStyle({ ...editingStyle, promptGuidanceForAI: e.target.value })}
									/>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setEditingStyle(null)}>Cancel</Button>
								<Button onClick={() => handleUpdate(editingStyle)}>Save Changes</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	)
}
