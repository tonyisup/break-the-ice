"use client"

import * as React from "react"
import { useQuery, useAction, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Trash2,
	CheckCircle2,
	AlertCircle,
	Clock,
	ThumbsUp,
	X,
	Search,
	Filter,
	BarChart3,
	Calendar,
	Zap
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

export default function PruningPage() {
	const [maxQuestions, setMaxQuestions] = React.useState(50)
	const [sendEmail, setSendEmail] = React.useState(false)
	const [isPruning, setIsPruning] = React.useState(false)
	const [lastResult, setLastResult] = React.useState<{ questionsDeleted: number; errors: string[] } | null>(null)

	const staleQuestions = useQuery(api.questions.getStaleQuestionsPreview, { maxQuestions })
	const pruneAction = useAction(api.questions.pruneStaleQuestionsAdmin)
	const keepMutation = useMutation(api.questions.doNotPruneQuestion)

	const handlePrune = async () => {
		if (!confirm(`Are you sure you want to prune up to ${maxQuestions} questions?`)) return
		try {
			setIsPruning(true)
			const result = await pruneAction({ maxQuestions, sendEmail })
			setLastResult(result)
			toast.success(`Successfully pruned ${result.questionsDeleted} questions`)
		} catch (error: any) {
			toast.error(error.message || "Failed to prune questions")
		} finally {
			setIsPruning(false)
		}
	}

	const handleKeep = async (id: Id<"questions">) => {
		try {
			await keepMutation({ questionId: id })
			toast.success("Question exempt from pruning")
		} catch (error) {
			toast.error("Failed to update question")
		}
	}

	if (!staleQuestions) {
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
					<h2 className="text-3xl font-bold tracking-tight">Content Pruning</h2>
					<p className="text-muted-foreground">Clean up stale, unliked, or low-quality questions.</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border">
						<label className="text-xs font-medium">Auto-scan Limit:</label>
						<Input
							type="number"
							className="w-16 h-7 text-xs"
							value={maxQuestions}
							onChange={e => setMaxQuestions(parseInt(e.target.value) || 0)}
						/>
					</div>
					<Button variant="destructive" onClick={handlePrune} disabled={isPruning || staleQuestions.length === 0} className="gap-2 shadow-lg shadow-destructive/20">
						{isPruning ? <Zap className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
						Prune Now
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				{/* Left Column: Preview List */}
				<div className="lg:col-span-2 space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-lg font-bold flex items-center gap-2">
							Stale Questions Preview
							<Badge variant="secondary" className="font-mono">{staleQuestions.length}</Badge>
						</h3>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Calendar className="size-3" />
							Older than 1 week
						</div>
					</div>

					<div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
						{staleQuestions.map((q: any) => {
							const daysOld = Math.floor((Date.now() - q._creationTime) / (1000 * 60 * 60 * 24))
							return (
								<div key={q._id} className="group bg-card border rounded-2xl p-4 hover:border-primary/30 transition-all flex items-start gap-4">
									<div className="flex-1 space-y-2">
										<p className="text-sm font-medium leading-relaxed">{q.text || q.customText}</p>
										<div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
											<div className="flex items-center gap-1 font-mono uppercase bg-muted/50 px-1.5 py-0.5 rounded">
												{q.style} / {q.tone}
											</div>
											<span className="flex items-center gap-1"><BarChart3 className="size-3" /> {q.totalShows} Views</span>
											<span className="flex items-center gap-1 text-red-500"><AlertCircle className="size-3" /> 0 Likes</span>
											<span className="flex items-center gap-1"><Clock className="size-3" /> {daysOld}d old</span>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										className="size-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => handleKeep(q._id)}
										title="Mark to keep"
									>
										<ThumbsUp className="size-3.5 text-green-600" />
									</Button>
								</div>
							)
						})}
						{staleQuestions.length === 0 && (
							<div className="py-20 text-center space-y-4 border-2 border-dashed rounded-3xl bg-muted/20">
								<CheckCircle2 className="size-12 text-green-500/20 mx-auto" />
								<p className="text-muted-foreground">Your library is crystal clean! No stale questions found.</p>
							</div>
						)}
					</div>
				</div>

				{/* Right Column: Controls & Info */}
				<div className="space-y-6">
					<div className="bg-card border rounded-2xl p-6 space-y-6">
						<h3 className="font-bold flex items-center gap-2">
							<Filter className="size-4" />
							Pruning Criteria
						</h3>

						<div className="space-y-4">
							<div className="flex items-start gap-3">
								<div className="size-5 rounded bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
									<Clock className="size-3" />
								</div>
								<div className="space-y-1">
									<p className="text-xs font-bold">Age Requirement</p>
									<p className="text-[10px] text-muted-foreground">Questions must be at least 7 days old to be considered stale.</p>
								</div>
							</div>

							<div className="flex items-start gap-3">
								<div className="size-5 rounded bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
									<BarChart3 className="size-3" />
								</div>
								<div className="space-y-1">
									<p className="text-xs font-bold">Public Presence</p>
									<p className="text-[10px] text-muted-foreground">Must have been shown to users at least once with zero likes.</p>
								</div>
							</div>

							<div className="flex items-start gap-3">
								<div className="size-5 rounded bg-red-500/10 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
									<AlertCircle className="size-3" />
								</div>
								<div className="space-y-1">
									<p className="text-xs font-bold">Unread/Unliked</p>
									<p className="text-[10px] text-muted-foreground">Questions with any likes or that are relatively new are always safe.</p>
								</div>
							</div>
						</div>

						<div className="pt-6 border-t space-y-4">
							<div className="flex items-center space-x-2">
								<Checkbox id="email" checked={sendEmail} onCheckedChange={(val) => setSendEmail(!!val)} />
								<label htmlFor="email" className="text-xs font-medium leading-none cursor-pointer">
									Email summary to admin
								</label>
							</div>
							<p className="text-[10px] text-muted-foreground">The pruning process runs automatically every day at 2 AM UTC.</p>
						</div>
					</div>

					{lastResult && (
						<div className={`rounded-2xl p-6 border-l-4 transition-all animate-in slide-in-from-right-5 ${lastResult.errors.length > 0 ? 'bg-amber-500/5 border-amber-500' : 'bg-green-500/5 border-green-500'
							}`}>
							<div className="flex items-center justify-between mb-4">
								<h4 className="font-bold text-sm">Last Run Results</h4>
								<Badge variant="outline" className="text-[8px]">{new Date().toLocaleTimeString()}</Badge>
							</div>
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">Pruned</span>
									<span className="text-lg font-bold">{lastResult.questionsDeleted}</span>
								</div>
								{lastResult.errors.length > 0 && (
									<div className="space-y-1">
										<p className="text-[10px] font-bold text-amber-600 uppercase">Errors encountered:</p>
										<ul className="text-[10px] text-red-500/70 list-disc list-inside">
											{lastResult.errors.map((e, i) => <li key={i}>{e}</li>)}
										</ul>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
