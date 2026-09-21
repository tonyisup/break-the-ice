"use client"

import * as React from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"
import {
	Copy,
	X,
	RefreshCw,
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
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { QuestionReviewHistory } from "@/components/admin/QuestionReviewHistory"

export default function DuplicatesPage() {
	const duplicateDetections = useQuery(api.admin.questions.getPendingDuplicateDetections)
	const progress = useQuery(api.admin.duplicates.getLatestDuplicateDetectionProgress)

	const updateStatus = useMutation(api.admin.questions.updateDuplicateDetectionStatus)
	const deleteDuplicates = useMutation(api.admin.questions.deleteDuplicateQuestions)
	const updateQuestion = useMutation(api.admin.questions.updateQuestion)
	const detectDuplicatesAction = useAction(api.admin.ai.startDuplicateDetection)

	const [selectedGroupId, setSelectedGroupId] = React.useState<Id<"duplicateDetections"> | null>(null)
	const [busy, setBusy] = React.useState(false)
	const [editRevision, setEditRevision] = React.useState(0)
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
			toast.error(error instanceof Error ? error.message : "Failed to start detection")
			setIsDetecting(false)
		} finally { setIsDetecting(false) }
	}

	const handleSelectKeep = (detectionId: Id<"duplicateDetections">, questionId: Id<"questions">, groupIds: Id<"questions">[]) => {
        if (busy || editingQuestionId) return;
        setSelectedGroupId(detectionId)
		if (keepQuestionId === questionId && selectedGroupId === detectionId) {
			setKeepQuestionId(null)
			setSelectedToDelete(new Set())
		} else {
			setKeepQuestionId(questionId)
			const toDelete = groupIds.filter(id => id !== questionId)
			setSelectedToDelete(new Set(toDelete))
		}
	}

	const handleApprove = async (detectionId: Id<"duplicateDetections">) => {
		if (!keepQuestionId || selectedGroupId !== detectionId) {
			toast.error("Please select a question to keep in this group")
			return
		}
        const detection = duplicateDetections?.find(item => item._id === detectionId)
        if (!detection) return
        setBusy(true)
		try {
			await deleteDuplicates({
				detectionId,
				questionIdsToDelete: Array.from(selectedToDelete),
				keepQuestionId,
                reason: rejectReasons[detectionId] || "",
                expectedRevisions: detection.questions.map(question => ({ questionId: question._id, revision: question.reviewRevision ?? 0 }))
			})
			toast.success("Duplicates resolved")
			setKeepQuestionId(null)
			setSelectedToDelete(new Set())
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to resolve duplicates")
		} finally { setBusy(false) }
	}

	const handleReject = async (detectionId: Id<"duplicateDetections">) => {
        setBusy(true)
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
			toast.error(error instanceof Error ? error.message : "Failed to reject detection")
		} finally { setBusy(false) }
	}

	const handleSaveEdit = async (questionId: Id<"questions">, detectionId: Id<"duplicateDetections">) => {
        setBusy(true)
		try {
			await updateQuestion({ id: questionId, text: editedText, expectedRevision: editRevision, reviewSource: "duplicates", reviewReason: rejectReasons[detectionId] || "" })
			toast.success("Question updated")
			setEditingQuestionId(null)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to update question")
		} finally { setBusy(false) }
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
					<h1 className="text-3xl font-bold tracking-tight">Duplicates</h1>
					<p className="text-muted-foreground">Select one question to keep in discovery. Retired copies retain their saved items, history, schedules, and existing public links.</p>
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
						<Button onClick={() => { void handleStartDetection() }} disabled={isDetecting || progress?.status === 'running'} className="gap-2">
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
					{duplicateDetections.map((detection) => (
						<div key={detection._id} className="bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
									{detection.questions.map((q) => (
										<div
											key={q._id}
											className={`group relative p-4 rounded-xl border-2 transition-colors ${selectedGroupId === detection._id && keepQuestionId === q._id
												? 'border-green-500 bg-green-500/5 ring-1 ring-green-500'
												: selectedGroupId === detection._id && selectedToDelete.has(q._id)
													? 'border-border bg-muted/40'
													: 'border-muted hover:border-primary/30'
												}`}
										>
											<div className="flex items-start justify-between gap-4">
												<div className="min-w-0 flex-1 space-y-2">
													{editingQuestionId === q._id ? (
														<div className="flex gap-2 items-start">
															<textarea
                                                        aria-label="Edit duplicate question"
                                                        disabled={busy}
																className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
																value={editedText}
																onChange={e => setEditedText(e.target.value)}

															/>
															<div className="flex flex-col gap-1">
																<Button size="icon" className="size-8 bg-green-600 hover:bg-green-700" aria-label="Save edit" disabled={busy || !editedText.trim() || !rejectReasons[detection._id]?.trim()} onClick={() => { void handleSaveEdit(q._id, detection._id) }}><Save className="size-3.5" /></Button>
																<Button size="icon" variant="ghost" className="size-8" aria-label="Discard edit" disabled={busy} onClick={() => setEditingQuestionId(null)}><X className="size-3.5" /></Button>
															</div>
														</div>
													) : (
														<div className="flex items-center justify-between group/text">
															<p className="font-medium text-sm leading-relaxed">{q.text}</p>
															<Button
																variant="ghost"
																size="icon"
																className="size-8" aria-label="Edit question" disabled={busy}
																onClick={(e) => {
																	e.stopPropagation()
																	setEditingQuestionId(q._id)
																	setEditedText(q.text)
                                                        setEditRevision(q.reviewRevision ?? 0)
																}}
															>
																<Pencil className="size-3" />
															</Button>
														</div>
													)}
													<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
														<span className="flex items-center gap-1 font-mono">
															{q.style && <Badge variant="outline" className="flex items-center gap-1">
																<IconComponent icon={q.style.icon as React.ComponentProps<typeof IconComponent>["icon"]} color={q.style.color} />
																{q.style.name}
															</Badge>}
															{q.tone && <Badge variant="outline" className="flex items-center gap-1">
																<IconComponent icon={q.tone.icon as React.ComponentProps<typeof IconComponent>["icon"]} color={q.tone.color} />
																{q.tone.name}
															</Badge>}
														</span>
														<span className="flex items-center gap-1">Likes: <span className="text-foreground">{q.totalLikes}</span></span>
														<span className="flex items-center gap-1">Created: <span className="text-foreground">{new Date(q._creationTime).toLocaleDateString()}</span></span>
													</div>
												</div>
												<label className="flex shrink-0 items-center gap-2 rounded-md p-2 text-sm">
                                                    <input type="radio" name={`keep-${detection._id}`} aria-label={`Keep ${q.text}`} checked={selectedGroupId === detection._id && keepQuestionId === q._id} disabled={busy || editingQuestionId !== null} onChange={() => handleSelectKeep(detection._id, q._id, detection.questions.map(question => question._id))} />
                                                    Keep
                                                </label>
											</div>
										</div>
									))}
								</div>


                                <div className="pt-6 border-t space-y-3">
                                    <Label htmlFor={`reason-${detection._id}`}>Review reason</Label>
                                    <Input id={`reason-${detection._id}`} placeholder="Explain the edit, duplicate match, or rejection…" maxLength={2000} value={rejectReasons[detection._id] || ""} disabled={busy} onChange={event => setRejectReasons(previous => ({ ...previous, [detection._id]: event.target.value }))} />
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-sm text-muted-foreground">{selectedGroupId === detection._id && keepQuestionId ? `${selectedToDelete.size} copies will be retired; original records are preserved.` : "Select one question to retain in this group."}</p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" disabled={busy || editingQuestionId !== null || !rejectReasons[detection._id]?.trim()} onClick={() => { void handleReject(detection._id) }}>Reject detection</Button>
                                            <Button disabled={busy || editingQuestionId !== null || selectedGroupId !== detection._id || !keepQuestionId || !rejectReasons[detection._id]?.trim()} onClick={() => { void handleApprove(detection._id) }}>Resolve duplicates</Button>
                                        </div>
                                    </div>
                                </div>
							</div>
						</div>
					))}
				</div>
			)}
            <QuestionReviewHistory source="duplicates" />
		</div>
	)
}
