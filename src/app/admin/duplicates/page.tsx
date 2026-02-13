"use client"

import * as React from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api, internal } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Copy,
	Trash2,
	Check,
	X,
	AlertTriangle,
	Search,
	RefreshCw,
	MoreHorizontal,
	ChevronRight,
	History,
	Pencil,
	Save
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { IconComponent } from "@/components/ui/icons/icon"
import { cn } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"

export default function DuplicatesPage() {
	const duplicateDetections = useQuery(api.admin.questions.getPendingDuplicateDetections)
	const progress = useQuery(api.admin.duplicates.getLatestDuplicateDetectionProgress)

	const updateStatus = useMutation(api.admin.questions.updateDuplicateDetectionStatus)
	const deleteDuplicates = useMutation(api.admin.questions.deleteDuplicateQuestions)
	const updateQuestion = useMutation(api.admin.questions.updateQuestion)
	const detectDuplicatesAction = useAction(api.admin.ai.startDuplicateDetection)

	const [selectedToDelete, setSelectedToDelete] = React.useState<Set<Id<"questions">>>(new Set())
	const [keepQuestionId, setKeepQuestionId] = React.useState<Id<"questions"> | null>(null)
	const [editingQuestionId, setEditingQuestionId] = React.useState<Id<"questions"> | null>(null)
	const [editedText, setEditedText] = React.useState("")
	const [rejectReasons, setRejectReasons] = React.useState<Record<string, string>>({})
	const [isDetecting, setIsDetecting] = React.useState(false)
	const [threshold, setThreshold] = React.useState([0.95])


	const handleStartDetection = async () => {
		try {
			setIsDetecting(true)
			await detectDuplicatesAction({ threshold: threshold[0] })
			toast.success("Duplicate detection started")
		} catch (error) {
			toast.error("Failed to start detection")
			setIsDetecting(false)
		}
	}

	const handleSelectKeep = (questionId: Id<"questions">, groupIds: Id<"questions">[]) => {
		if (keepQuestionId === questionId) {
			setKeepQuestionId(null)
			setSelectedToDelete(new Set())
		} else {
			setKeepQuestionId(questionId)
			const toDelete = groupIds.filter(id => id !== questionId)
			setSelectedToDelete(new Set(toDelete))
		}
	}

	const handleApprove = async (detectionId: Id<"duplicateDetections">) => {
		if (!keepQuestionId) {
			toast.error("Please select a question to keep")
			return
		}
		try {
			await deleteDuplicates({
				detectionId,
				questionIdsToDelete: Array.from(selectedToDelete),
				keepQuestionId
			})
			toast.success("Duplicates resolved")
			setKeepQuestionId(null)
			setSelectedToDelete(new Set())
		} catch (error) {
			toast.error("Failed to resolve duplicates")
		}
	}

	const handleReject = async (detectionId: Id<"duplicateDetections">) => {
		try {
			await updateStatus({
				detectionId,
				status: "rejected",
				rejectReason: rejectReasons[detectionId] || ""
			})
			toast.success("Detection rejected")
			setRejectReasons(prev => {
				const next = { ...prev }
				delete next[detectionId]
				return next
			})
		} catch (error) {
			toast.error("Failed to reject detection")
		}
	}

	const handleSaveEdit = async (questionId: Id<"questions">) => {
		try {
			await updateQuestion({ id: questionId, text: editedText })
			toast.success("Question updated")
			setEditingQuestionId(null)
		} catch (error) {
			toast.error("Failed to update question")
		}
	}

	if (!duplicateDetections) {
		return (
			<div className="flex flex-col gap-4 animate-pulse">
				<div className="h-10 bg-muted rounded w-1/4" />
				<div className="h-64 bg-muted rounded w-full" />
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Duplicates</h2>
					<p className="text-muted-foreground">Review and merge duplicate questions detected by AI.</p>
				</div>
				<div className="flex flex-col gap-2 min-w-[200px]">
					<div className="flex items-center justify-between">
						<Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Similarity Cutoff</Label>
						<span className="text-xs font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-primary">{(threshold[0] * 100).toFixed(0)}%</span>
					</div>
					<Slider
						value={threshold}
						onValueChange={setThreshold}
						max={1}
						min={0.7}
						step={0.01}
						disabled={isDetecting || progress?.status === 'running'}
						className="py-1"
					/>
				</div>
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2">
						<Button variant="outline" asChild>
							<Link to="/admin/duplicates/completed" className="gap-2">
								<History className="size-4" />
								History
							</Link>
						</Button>
						<Button onClick={handleStartDetection} disabled={isDetecting || progress?.status === 'running'} className="gap-2">
							<RefreshCw className={`size-4 ${progress?.status === 'running' ? 'animate-spin' : ''}`} />
							Scan for Duplicates
						</Button>
					</div>
				</div>
			</div>

			{progress?.status === 'running' && (
				<div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 space-y-4">
					<div className="flex items-center justify-between">
						<div className="space-y-1">
							<h4 className="font-bold text-blue-600 dark:text-blue-400">Scanning in Progress...</h4>
							<p className="text-xs text-muted-foreground">Batch {progress.currentBatch} of {progress.totalBatches}</p>
						</div>
						<Badge variant="outline" className="animate-pulse bg-blue-500/10 text-blue-600 border-blue-200">Processing {progress.processedQuestions} / {progress.totalQuestions}</Badge>
					</div>
					<Progress value={(progress.processedQuestions / progress.totalQuestions) * 100} className="h-2" />
				</div>
			)}

			{duplicateDetections.length === 0 ? (
				<div className="py-20 text-center space-y-4 border-2 border-dashed rounded-3xl">
					<Copy className="size-12 text-muted-foreground/20 mx-auto" />
					<div className="space-y-1">
						<p className="text-lg font-medium">No pending duplicates found</p>
						<p className="text-muted-foreground">Everything looks clean! Run a scan to double check.</p>
					</div>
				</div>
			) : (
				<div className="grid gap-8">
					{duplicateDetections.map((detection: any) => (
						<div key={detection._id} className="bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
							<div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Badge variant="outline" className="font-mono text-[10px] bg-background">GROUP: {detection._id.slice(0, 8)}</Badge>
									<span className="text-xs font-medium text-muted-foreground">{detection.reason}</span>
								</div>
								<Badge className={`${detection.confidence > 0.9 ? 'bg-red-500' : 'bg-amber-500'} text-white`}>
									{(detection.confidence * 100).toFixed(0)}% Confidence
								</Badge>
							</div>

							<div className="p-6 space-y-4">
								<div className="grid gap-3">
									{detection.questions.map((q: any) => (
										<div
											key={q._id}
											className={`group relative p-4 rounded-xl border-2 transition-all cursor-pointer ${keepQuestionId === q._id
												? 'border-green-500 bg-green-500/5 ring-1 ring-green-500'
												: selectedToDelete.has(q._id)
													? 'border-red-200 bg-red-50/50 opacity-60'
													: 'border-muted hover:border-primary/30'
												}`}
											onClick={() => handleSelectKeep(q._id, detection.questions.map((qu: any) => qu._id))}
										>
											<div className="flex items-start justify-between gap-4">
												<div className="flex-1 space-y-2">
													{editingQuestionId === q._id ? (
														<div className="flex gap-2 items-start" onClick={e => e.stopPropagation()}>
															<textarea
																className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
																value={editedText}
																onChange={e => setEditedText(e.target.value)}
																autoFocus
															/>
															<div className="flex flex-col gap-1">
																<Button size="icon" className="size-8 bg-green-600 hover:bg-green-700" onClick={() => handleSaveEdit(q._id)}><Save className="size-3.5" /></Button>
																<Button size="icon" variant="ghost" className="size-8" onClick={() => setEditingQuestionId(null)}><X className="size-3.5" /></Button>
															</div>
														</div>
													) : (
														<div className="flex items-center justify-between group/text">
															<p className="font-medium text-sm leading-relaxed">{q.text}</p>
															<Button
																variant="ghost"
																size="icon"
																className="size-6 opacity-0 group-hover/text:opacity-100 transition-opacity"
																onClick={(e) => {
																	e.stopPropagation()
																	setEditingQuestionId(q._id)
																	setEditedText(q.text)
																}}
															>
																<Pencil className="size-3" />
															</Button>
														</div>
													)}
													<div className="flex items-center gap-3 text-[10px] text-muted-foreground">
														<span className="flex items-center gap-1 font-mono">
															<Badge variant="outline" className="flex items-center gap-1">
																<IconComponent icon={q.style.icon} color={q.style.color} />
																{q.style.name}
															</Badge>
															<Badge variant="outline" className="flex items-center gap-1">
																<IconComponent icon={q.tone.icon} color={q.tone.color} />
																{q.tone.name}
															</Badge>
														</span>
														<span className="flex items-center gap-1">Likes: <span className="text-foreground">{q.totalLikes}</span></span>
														<span className="flex items-center gap-1">Created: <span className="text-foreground">{new Date(q._creationTime).toLocaleDateString()}</span></span>
													</div>
												</div>
												<div className="pt-1">
													{keepQuestionId === q._id ? (
														<div className="size-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg animate-in zoom-in-50">
															<Check className="size-4" />
														</div>
													) : selectedToDelete.has(q._id) ? (
														<div className="size-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
															<Trash2 className="size-3.5" />
														</div>
													) : (
														<div className="size-6 rounded-full border-2 border-muted flex items-center justify-center" />
													)}
												</div>
											</div>
										</div>
									))}
								</div>

								<div className="pt-6 border-t flex flex-col md:flex-row items-center justify-between gap-4">
									{keepQuestionId ? (
										<div className="flex items-center gap-3 bg-green-500/5 px-4 py-2 rounded-full border border-green-500/20">
											<Check className="size-4 text-green-600" />
											<span className="text-xs font-medium text-green-700">Merging {selectedToDelete.size} duplicates into main question</span>
										</div>
									) : (
										<div className="flex-1 w-full">
											<Input
												placeholder="Reason for rejection (optional)..."
												value={rejectReasons[detection._id] || ""}
												onChange={e => setRejectReasons(prev => ({ ...prev, [detection._id]: e.target.value }))}
												className="bg-muted/20 border-0 focus-visible:ring-1"
											/>
										</div>
									)}

									<div className="flex items-center gap-2 w-full md:w-auto">
										{keepQuestionId ? (
											<Button className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20" onClick={() => handleApprove(detection._id)}>
												Resolve Duplicates
											</Button>
										) : (
											<>
												<Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleReject(detection._id)}>
													Reject Detection
												</Button>
												<Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => {
													// Special case: Delete all in group
													if (confirm("Delete all questions in this group?")) {
														deleteDuplicates({
															detectionId: detection._id,
															questionIdsToDelete: detection.questions.map((qu: any) => qu._id)
														})
													}
												}}>
													Delete All
												</Button>
											</>
										)}
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
