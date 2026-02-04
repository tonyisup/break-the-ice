"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Search,
	Plus,
	MoreHorizontal,
	Pencil,
	Trash2,
	Check,
	X,
	CheckCircle2,
	UserCircle,
	Share2,
	LayoutGrid,
	List,
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
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function QuestionsPage() {
	const allQuestions = useQuery(api.questions.getQuestions)
	const styles = useQuery(api.styles.getStyles, {})
	const tones = useQuery(api.tones.getTones, {})

	const createQuestion = useMutation(api.questions.createQuestion)
	const updateQuestion = useMutation(api.questions.updateQuestion)
	const deleteQuestion = useMutation(api.questions.deleteQuestion)

	const [search, setSearch] = React.useState("")
	const [viewMode, setViewMode] = React.useState<"table" | "grid">("table")
	const [editingQuestion, setEditingQuestion] = React.useState<Doc<"questions"> | null>(null)
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)

	// Create New Question State
	const [newQuestion, setNewQuestion] = React.useState({
		text: "",
		style: "open-ended",
		tone: "fun-silly",
	})

	// Pending Questions
	const pendingQuestions = allQuestions?.filter(q => q.status === "pending") ?? []
	const activeQuestions = allQuestions?.filter(q => q.status !== "pending") ?? []

	const filteredQuestions = activeQuestions.filter(q => {
		const text = q.text?.toLowerCase() || q.customText?.toLowerCase() || ""
		const styleName = styles?.find(s => s.id === q.style)?.name.toLowerCase() || ""
		const toneName = tones?.find(t => t.id === q.tone)?.name.toLowerCase() || ""
		const searchLower = search.toLowerCase()
		return text.includes(searchLower) || styleName.includes(searchLower) || toneName.includes(searchLower)
	})

	const handleCreate = async () => {
		if (!newQuestion.text.trim()) return
		try {
			await createQuestion({
				text: newQuestion.text,
				style: newQuestion.style,
				tone: newQuestion.tone,
			})
			toast.success("Question created successfully")
			setNewQuestion({ text: "", style: "open-ended", tone: "fun-silly" })
			setIsCreateDialogOpen(false)
		} catch (error) {
			toast.error("Failed to create question")
		}
	}

	const handleUpdate = async (q: Doc<"questions">) => {
		try {
			await updateQuestion({
				id: q._id,
				text: q.text || q.customText!,
				style: q.style || undefined,
				tone: q.tone || undefined,
				status: q.status === "pending" ? "public" : q.status,
			})
			toast.success("Question updated")
			setEditingQuestion(null)
		} catch (error) {
			toast.error("Failed to update question")
		}
	}

	const handleDelete = async (id: Id<"questions">) => {
		if (!confirm("Are you sure you want to delete this question?")) return
		try {
			await deleteQuestion({ id })
			toast.success("Question deleted")
		} catch (error) {
			toast.error("Failed to delete question")
		}
	}

	const handleApprove = async (q: Doc<"questions">, status: "public" | "personal") => {
		try {
			await updateQuestion({
				id: q._id,
				text: q.text || q.customText!,
				style: q.style || undefined,
				tone: q.tone || undefined,
				status: status === "public" ? "public" : "private",
			})
			toast.success(`Question marked as ${status}`)
		} catch (error) {
			toast.error("Failed to process question")
		}
	}

	const handleShare = async (q: Doc<"questions">) => {
		try {
			const url = `${window.location.origin}/question/${q._id}`
			await navigator.clipboard.writeText(url)
			toast.success("Link copied to clipboard")
		} catch (error) {
			console.error("Failed to copy link:", error)
			toast.error("Failed to copy link")
		}
	}

	if (!allQuestions || !styles || !tones) {
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
					<h2 className="text-3xl font-bold tracking-tight">Questions</h2>
					<p className="text-muted-foreground">Manage and moderate questions in the database.</p>
				</div>
				<div className="flex items-center gap-2">
					<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
						<DialogTrigger asChild>
							<Button className="gap-2">
								<Plus className="size-4" />
								Add Question
							</Button>
						</DialogTrigger>
						<DialogContent className="sm:max-w-[500px]">
							<DialogHeader>
								<DialogTitle>Create New Question</DialogTitle>
								<DialogDescription>Add a new manually curated question to the pool.</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid gap-2">
									<label htmlFor="text" className="text-sm font-medium">Question Text</label>
									<textarea
										id="text"
										value={newQuestion.text}
										onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
										className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
										placeholder="Enter your question here..."
									/>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="grid gap-2">
										<label htmlFor="style-select" className="text-sm font-medium">Style</label>
										<select
											id="style-select"
											value={newQuestion.style}
											onChange={(e) => setNewQuestion({ ...newQuestion, style: e.target.value })}
											className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
										</select>
									</div>
									<div className="grid gap-2">
										<label htmlFor="tone-select" className="text-sm font-medium">Tone</label>
										<select
											id="tone-select"
											value={newQuestion.tone}
											onChange={(e) => setNewQuestion({ ...newQuestion, tone: e.target.value })}
											className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{tones.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
										</select>
									</div>
								</div>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
								<Button onClick={handleCreate}>Create Question</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{pendingQuestions.length > 0 && (
				<section className="space-y-4">
					<div className="flex items-center gap-2">
						<h3 className="text-xl font-semibold">Pending Review</h3>
						<Badge variant="secondary" className="rounded-full">{pendingQuestions.length}</Badge>
					</div>
					<div className="grid gap-4">
						{pendingQuestions.map((q) => (
							<div key={q._id} className="p-4 md:p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-primary/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 transition-all hover:border-primary/40">
								<div className="space-y-2 flex-1">
									<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-widest">
										<UserCircle className="size-3" />
										User Submitted
									</div>
									<p className="text-base md:text-lg font-medium">{q.customText}</p>
								</div>
								<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
									<Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 flex-1 sm:flex-none justify-center" onClick={() => handleApprove(q, "personal")}>
										Mark Personal
									</Button>
									<Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-2 flex-1 sm:flex-none justify-center" onClick={() => handleApprove(q, "public")}>
										<CheckCircle2 className="size-4" />
										Approve Public
									</Button>
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
					<div className="flex items-center gap-2 flex-1 md:max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
						<Search className="size-4 text-muted-foreground" />
						<Input
							placeholder="Search questions, styles, or tones..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
						/>
						{search && <Button variant="ghost" size="icon" className="size-6" onClick={() => setSearch("")}><X className="size-3" /></Button>}
					</div>

					<div className="flex items-center bg-muted/50 p-1 rounded-lg border self-start sm:self-auto">
						<Button
							variant={viewMode === "table" ? "secondary" : "ghost"}
							size="sm"
							className="h-8 px-3 gap-2"
							onClick={() => setViewMode("table")}
						>
							<List className="size-4" />
							<span className="hidden lg:inline">Table</span>
						</Button>
						<Button
							variant={viewMode === "grid" ? "secondary" : "ghost"}
							size="sm"
							className="h-8 px-3 gap-2"
							onClick={() => setViewMode("grid")}
						>
							<LayoutGrid className="size-4" />
							<span className="hidden lg:inline">Grid</span>
						</Button>
					</div>
				</div>

				{viewMode === "table" ? (
					<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
						<table className="w-full text-sm text-left block md:table">
							<thead className="hidden md:table-header-group bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
								<tr>
									<th className="px-6 py-4">Question</th>
									<th className="px-6 py-4 w-40">Style</th>
									<th className="px-6 py-4 w-40">Tone</th>
									<th className="px-6 py-4 w-20 text-right">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y block md:table-row-group">
								{filteredQuestions.map((q) => {
									const style = styles.find(s => s._id === q.styleId || s.id === q.style);
									const tone = tones.find(t => t._id === q.toneId || t.id === q.tone);
									const isEditing = editingQuestion?._id === q._id;

									return (
										<tr key={q._id} className="block md:table-row hover:bg-muted/30 transition-colors group">
											<td className="block md:table-cell px-4 md:px-6 py-3 md:py-4">
												<div className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Question</div>
												{isEditing ? (
													<textarea
														className="w-full min-h-[80px] p-2 rounded-md border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
														value={editingQuestion.text || editingQuestion.customText || ""}
														onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
													/>
												) : (
													<span className="font-medium text-base md:text-sm leading-relaxed">{q.text || q.customText}</span>
												)}
											</td>
											<td className="block md:table-cell px-4 md:px-6 py-2 md:py-4">
												<div className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Style</div>
												{isEditing ? (
													<select
														className="w-full h-9 rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
														value={editingQuestion.style || ""}
														onChange={(e) => setEditingQuestion({ ...editingQuestion, style: e.target.value })}
													>
														<option value="">No Style</option>
														{styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
													</select>
												) : style ? (
													<Badge
														variant="outline"
														className="gap-1.5 font-medium py-1"
														style={{ borderColor: `${style.color}40`, backgroundColor: `${style.color}10`, color: style.color }}
													>
														<IconComponent icon={style.icon as Icon} size={14} color={style.color} />
														{style.name}
													</Badge>
												) : <span className="text-muted-foreground italic text-xs">None</span>}
											</td>
											<td className="block md:table-cell px-4 md:px-6 py-2 md:py-4">
												<div className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Tone</div>
												{isEditing ? (
													<select
														className="w-full h-9 rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
														value={editingQuestion.tone || ""}
														onChange={(e) => setEditingQuestion({ ...editingQuestion, tone: e.target.value })}
													>
														<option value="">No Tone</option>
														{tones.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
													</select>
												) : tone ? (
													<Badge
														variant="outline"
														className="gap-1.5 font-medium py-1"
														style={{ borderColor: `${tone.color}40`, backgroundColor: `${tone.color}10`, color: tone.color }}
													>
														<IconComponent icon={tone.icon as Icon} size={14} color={tone.color} />
														{tone.name}
													</Badge>
												) : <span className="text-muted-foreground italic text-xs">None</span>}
											</td>
											<td className="block md:table-cell px-4 md:px-6 py-3 md:py-4 text-right">
												<div className="flex items-center justify-start md:justify-end gap-2 transition-opacity">
													{isEditing ? (
														<div className="flex gap-2 w-full md:w-auto">
															<Button variant="outline" className="flex-1 md:flex-none gap-2 text-green-600 border-green-200 bg-green-50" onClick={() => handleUpdate(editingQuestion)}>
																<Check className="size-4" />
																<span className="md:hidden">Save</span>
															</Button>
															<Button variant="outline" className="flex-1 md:flex-none gap-2 text-red-600 border-red-200 bg-red-50" onClick={() => setEditingQuestion(null)}>
																<X className="size-4" />
																<span className="md:hidden">Cancel</span>
															</Button>
														</div>
													) : (
														<div className="flex items-center gap-2 w-full justify-between md:justify-end">
															<span className="md:hidden text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Actions</span>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="icon" className="size-9 border md:border-0">
																		<MoreHorizontal className="size-5" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-48">
																	<DropdownMenuItem className="gap-2 py-2.5" onClick={() => handleShare(q)}>
																		<Share2 className="size-4" />
																		Share Link
																	</DropdownMenuItem>
																	<DropdownMenuItem className="gap-2 py-2.5" onClick={() => setEditingQuestion(q)}>
																		<Pencil className="size-4" />
																		Edit Question
																	</DropdownMenuItem>
																	<DropdownMenuItem className="gap-2 py-2.5 text-destructive focus:text-destructive" onClick={() => handleDelete(q._id)}>
																		<Trash2 className="size-4" />
																		Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</div>
													)}
												</div>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
						{filteredQuestions.length === 0 && (
							<div className="py-20 text-center space-y-2">
								<p className="text-lg font-medium">No questions found</p>
								<p className="text-muted-foreground">Try adjusting your search terms or add a new question.</p>
							</div>
						)}
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
						{filteredQuestions.map((q) => {
							const style = styles.find(s => s._id === q.styleId || s.id === q.style);
							const tone = tones.find(t => t._id === q.toneId || t.id === q.tone);
							const isEditing = editingQuestion?._id === q._id;

							return (
								<div
									key={q._id}
									className={cn(
										"group flex flex-col p-5 bg-card rounded-xl border-2 transition-all hover:shadow-lg",
										isEditing ? "border-primary ring-2 ring-primary/10" : "border-muted hover:border-primary/20"
									)}
								>
									<div className="flex-1 space-y-4">
										<div className="flex items-center justify-between gap-2">
											<div className="flex flex-wrap gap-1.5">
												{style ? (
													<Badge
														variant="outline"
														className="gap-1 font-medium text-[10px] py-0.5"
														style={{ borderColor: `${style.color}40`, backgroundColor: `${style.color}10`, color: style.color }}
													>
														<IconComponent icon={style.icon as Icon} size={12} color={style.color} />
														{style.name}
													</Badge>
												) : (
													<Badge variant="outline" className="text-[10px] py-0.5 text-muted-foreground">No Style</Badge>
												)}
												{tone ? (
													<Badge
														variant="outline"
														className="gap-1 font-medium text-[10px] py-0.5"
														style={{ borderColor: `${tone.color}40`, backgroundColor: `${tone.color}10`, color: tone.color }}
													>
														<IconComponent icon={tone.icon as Icon} size={12} color={tone.color} />
														{tone.name}
													</Badge>
												) : (
													<Badge variant="outline" className="text-[10px] py-0.5 text-muted-foreground">No Tone</Badge>
												)}
											</div>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon" className="size-8 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
														<MoreHorizontal className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem className="gap-2" onClick={() => handleShare(q)}>
														<Share2 className="size-4" /> Share Link
													</DropdownMenuItem>
													<DropdownMenuItem className="gap-2" onClick={() => setEditingQuestion(q)}>
														<Pencil className="size-4" /> Edit
													</DropdownMenuItem>
													<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(q._id)}>
														<Trash2 className="size-4" /> Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>

										{isEditing ? (
											<div className="space-y-3 pt-2">
												<textarea
													className="w-full min-h-[100px] p-3 rounded-md border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
													value={editingQuestion.text || editingQuestion.customText || ""}
													onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
													placeholder="Enter question text..."
												/>
												<div className="grid grid-cols-2 gap-2">
													<select
														className="w-full h-9 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
														value={editingQuestion.style || ""}
														onChange={(e) => setEditingQuestion({ ...editingQuestion, style: e.target.value })}
													>
														<option value="">No Style</option>
														{styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
													</select>
													<select
														className="w-full h-9 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
														value={editingQuestion.tone || ""}
														onChange={(e) => setEditingQuestion({ ...editingQuestion, tone: e.target.value })}
													>
														<option value="">No Tone</option>
														{tones.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
													</select>
												</div>
												<div className="flex gap-2 pt-2">
													<Button className="flex-1 h-9 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleUpdate(editingQuestion)}>
														<Check className="size-4 mr-2" /> Save
													</Button>
													<Button variant="outline" className="flex-1 h-9" onClick={() => setEditingQuestion(null)}>
														<X className="size-4 mr-2" /> Cancel
													</Button>
												</div>
											</div>
										) : (
											<p className="text-base font-medium leading-relaxed min-h-[4.5rem]">
												{q.text || q.customText}
											</p>
										)}
									</div>

									{!isEditing && (
										<div className="mt-4 pt-4 border-t border-muted flex items-center justify-between text-xs text-muted-foreground">
											<Badge variant="secondary" className="capitalize text-[10px] font-normal px-2 py-0">
												{q.status || "Public"}
											</Badge>
											<span>ID: {q._id.slice(0, 8)}...</span>
										</div>
									)}
								</div>
							)
						})}
						{filteredQuestions.length === 0 && (
							<div className="col-span-full py-20 text-center space-y-2 border-2 border-dashed rounded-xl">
								<p className="text-lg font-medium">No questions found</p>
								<p className="text-muted-foreground">Try adjusting your search terms or add a new question.</p>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
