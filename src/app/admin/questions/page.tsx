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
	Sparkles,
	CheckCircle2,
	UserCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuHeader,
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
import { AIQuestionGenerator } from "@/components/ai-question-generator/ai-question-generator"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"

export default function QuestionsPage() {
	const allQuestions = useQuery(api.questions.getQuestions)
	const styles = useQuery(api.styles.getStyles)
	const tones = useQuery(api.tones.getTones)

	const createQuestion = useMutation(api.questions.createQuestion)
	const updateQuestion = useMutation(api.questions.updateQuestion)
	const deleteQuestion = useMutation(api.questions.deleteQuestion)

	const [search, setSearch] = React.useState("")
	const [showAIGenerator, setShowAIGenerator] = React.useState(false)
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

	const handleApprove = async (q: Doc<"questions">, status: "approved" | "personal") => {
		try {
			await updateQuestion({
				id: q._id,
				text: q.text || q.customText!,
				style: q.style || undefined,
				tone: q.tone || undefined,
				status: status === "approved" ? "public" : "private", // Adjust based on schema literals if needed
			})
			toast.success(`Question marked as ${status}`)
		} catch (error) {
			toast.error("Failed to process question")
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
					<Button onClick={() => setShowAIGenerator(true)} variant="outline" className="gap-2">
						<Sparkles className="size-4 text-purple-500" />
						AI Generator
					</Button>
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
										<label className="text-sm font-medium">Style</label>
										<select
											value={newQuestion.style}
											onChange={(e) => setNewQuestion({ ...newQuestion, style: e.target.value })}
											className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
										</select>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Tone</label>
										<select
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
							<div key={q._id} className="p-6 bg-white dark:bg-gray-800 rounded-xl border-2 border-primary/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:border-primary/40">
								<div className="space-y-2 flex-1">
									<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-widest">
										<UserCircle className="size-3" />
										User Submitted
									</div>
									<p className="text-lg font-medium">{q.customText}</p>
								</div>
								<div className="flex items-center gap-3">
									<Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => handleApprove(q, "personal")}>
										Mark Personal
									</Button>
									<Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-2" onClick={() => handleApprove(q, "public")}>
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
				<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
					<Search className="size-4 text-muted-foreground" />
					<Input
						placeholder="Search questions, styles, or tones..."
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
								<th className="px-6 py-4">Question</th>
								<th className="px-6 py-4 w-40">Style</th>
								<th className="px-6 py-4 w-40">Tone</th>
								<th className="px-6 py-4 w-20 text-right">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{filteredQuestions.map((q) => {
								const style = styles.find(s => s.id === q.style);
								const tone = tones.find(t => t.id === q.tone);
								const isEditing = editingQuestion?._id === q._id;

								return (
									<tr key={q._id} className="hover:bg-muted/30 transition-colors group">
										<td className="px-6 py-4">
											{isEditing ? (
												<textarea
													className="w-full min-h-[60px] p-2 rounded-md border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
													value={editingQuestion.text || editingQuestion.customText || ""}
													onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
												/>
											) : (
												<span className="font-medium">{q.text || q.customText}</span>
											)}
										</td>
										<td className="px-6 py-4">
											{isEditing ? (
												<select
													className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
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
										<td className="px-6 py-4">
											{isEditing ? (
												<select
													className="w-full h-8 rounded-md border bg-background px-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
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
										<td className="px-6 py-4 text-right">
											<div className="flex items-center justify-end gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
												{isEditing ? (
													<>
														<Button variant="ghost" size="icon" className="size-8 text-green-600" onClick={() => handleUpdate(editingQuestion)}>
															<Check className="size-4" />
														</Button>
														<Button variant="ghost" size="icon" className="size-8 text-red-600" onClick={() => setEditingQuestion(null)}>
															<X className="size-4" />
														</Button>
													</>
												) : (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="icon" className="size-8">
																<MoreHorizontal className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-40">
															<DropdownMenuItem className="gap-2" onClick={() => setEditingQuestion(q)}>
																<Pencil className="size-3.5" />
																Edit Question
															</DropdownMenuItem>
															<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleDelete(q._id)}>
																<Trash2 className="size-3.5" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
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
			</div>

			<AnimatePresence>
				{showAIGenerator && (
					<AIQuestionGenerator
						onQuestionGenerated={() => setShowAIGenerator(false)}
						onClose={() => setShowAIGenerator(false)}
					/>
				)}
			</AnimatePresence>
		</div>
	)
}


