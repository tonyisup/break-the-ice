"use client"

import * as React from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"
import {
	Trash2,
	CheckCircle2,
	AlertCircle,
	BarChart3,
	Eye,
	Heart,
	Ghost,
	RefreshCw,
	MessageSquareOff,
	Zap,
	Settings
} from "lucide-react"

import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

export default function PruningPage() {
	const pendingTargets = useQuery(api.admin.pruning.getPendingTargets)
	const approvePruning = useMutation(api.admin.pruning.approvePruning)
	const rejectPruning = useMutation(api.admin.pruning.rejectPruning)

	const [processingIds, setProcessingIds] = React.useState<Set<Id<"pruning">>>(new Set())

	const handleApprove = async (id: Id<"pruning">) => {
		setProcessingIds(prev => new Set(prev).add(id))
		try {
			await approvePruning({ pruningId: id })
			toast.success("Question pruned successfully")
		} catch (error) {
			toast.error("Failed to prune question")
		} finally {
			setProcessingIds(prev => {
				const next = new Set(prev)
				next.delete(id)
				return next
			})
		}
	}

	const handleReject = async (id: Id<"pruning">) => {
		setProcessingIds(prev => new Set(prev).add(id))
		try {
			await rejectPruning({ pruningId: id })
			toast.success("Question kept in rotation")
		} catch (error) {
			toast.error("Failed to update status")
		} finally {
			setProcessingIds(prev => {
				const next = new Set(prev)
				next.delete(id)
				return next
			})
		}
	}

	const triggerGathering = useAction(api.admin.pruning.triggerGathering)
	const [isGathering, setIsGathering] = React.useState(false)

	const handleGatherNow = async () => {
		setIsGathering(true)
		const promise = triggerGathering({})
		toast.promise(promise, {
			loading: "Searching for pruning targets...",
			success: (data) => `Found ${data.targetsFound} new targets`,
			error: "Failed to gather pruning targets"
		})
		try {
			await promise
		} catch (e) {
			console.error(e)
		} finally {
			setIsGathering(false)
		}
	}

	if (pendingTargets === undefined) {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h2 className="text-3xl font-bold tracking-tight">Pruning Review</h2>
						<p className="text-muted-foreground">Identifying questions that aren't hitting the mark.</p>
					</div>
				</div>
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map(i => (
						<Skeleton key={i} className="h-[300px] w-full rounded-xl" />
					))}
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
			<div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-8">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Trash2 className="w-6 h-6 text-primary" />
						</div>
						<h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
							Pruning Workshop
						</h2>
					</div>
					<p className="text-md text-muted-foreground max-w-2xl">
						Review questions flagged for low engagement, high hidden rates, or style mismatches.
						Keep the pool fresh and relevant.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Button
						onClick={handleGatherNow}
						disabled={isGathering}
						variant="outline"
						className="rounded-xl h-10 border-2 font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
					>
						{isGathering ? (
							<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
						) : (
							<Zap className="w-4 h-4 mr-2 text-yellow-500 fill-yellow-500" />
						)}
						Find Prune Targets Now
					</Button>
					<Link to="/admin/prune/settings">
						<Button variant="outline" size="icon" className="rounded-xl h-10 border-2 shadow-sm hover:shadow-md transition-all active:scale-95">
							<Settings className="w-4 h-4 text-muted-foreground" />
						</Button>
					</Link>
					<Badge variant="outline" className="px-3 py-1 h-10 flex items-center text-sm font-bold bg-secondary/50 border-2 rounded-xl">
						{pendingTargets.length} Targets
					</Badge>
				</div>
			</div>

			{pendingTargets.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 text-center space-y-4 bg-secondary/20 rounded-3xl border-2 border-dashed">
					<div className="p-6 bg-background rounded-full shadow-lg">
						<Ghost className="w-12 h-12 text-muted-foreground/40" />
					</div>
					<div className="space-y-2">
						<h3 className="text-xl font-semibold">Clear Skies</h3>
						<p className="text-muted-foreground max-w-xs mx-auto">
							All questions are performing well. No pruning targets detected for now.
						</p>
					</div>
				</div>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{pendingTargets.map((target) => (
						<Card key={target._id} className="group relative overflow-hidden border-2 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-xl rounded-2xl flex flex-col">
							<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />

							<CardHeader className="pb-4">
								<div className="flex items-start justify-between mb-2">
									<Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-200 dark:border-red-900/50 hover:bg-red-500/20 transition-colors">
										Targeted for Pruning
									</Badge>
								</div>

								<div className="min-h-[80px] flex items-center">
									<p className="text-lg font-medium italic text-foreground/90 leading-relaxed">
										"{target.question.text || target.question.customText}"
									</p>
								</div>
							</CardHeader>

							<CardContent className="space-y-6 flex-grow">
								<div className="space-y-2">
									<div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
										<AlertCircle className="w-3.5 h-3.5" />
										Reasoning
									</div>
									<div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
										<p className="text-sm text-red-700 dark:text-red-400 font-medium">
											{target.reason}
										</p>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="p-3 rounded-xl bg-secondary/40 border border-secondary/60 transition-colors hover:bg-secondary/60">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<Eye className="w-3.5 h-3.5" />
											<span className="text-[10px] font-bold uppercase">Exposure</span>
										</div>
										<p className="text-lg font-bold tabular-nums">
											{target.metrics?.totalShows || 0}
										</p>
									</div>
									<div className="p-3 rounded-xl bg-secondary/40 border border-secondary/60 transition-colors hover:bg-secondary/60">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<Heart className="w-3.5 h-3.5" />
											<span className="text-[10px] font-bold uppercase">Likes</span>
										</div>
										<p className="text-lg font-bold tabular-nums">
											{target.metrics?.totalLikes || 0}
										</p>
									</div>
									<div className="p-3 rounded-xl bg-secondary/40 border border-secondary/60 transition-colors hover:bg-secondary/60">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<BarChart3 className="w-3.5 h-3.5" />
											<span className="text-[10px] font-bold uppercase">Avg Dur.</span>
										</div>
										<p className="text-lg font-bold tabular-nums">
											{((target.metrics?.averageViewDuration || 0) / 1000).toFixed(1)}s
										</p>
									</div>
									<div className="p-3 rounded-xl bg-secondary/40 border border-secondary/60 transition-colors hover:bg-secondary/60">
										<div className="flex items-center gap-2 text-muted-foreground mb-1">
											<MessageSquareOff className="w-3.5 h-3.5" />
											<span className="text-[10px] font-bold uppercase">Hidden</span>
										</div>
										<p className="text-lg font-bold tabular-nums">
											{target.metrics?.hiddenCount || 0}
										</p>
									</div>
								</div>
							</CardContent>

							<CardFooter className="pt-4 border-t bg-secondary/10 gap-3 group-hover:bg-secondary/20 transition-colors">
								<Button
									variant="outline"
									className="flex-1 rounded-xl h-11 font-semibold border-2 hover:bg-background transition-all"
									onClick={() => handleReject(target._id)}
									disabled={processingIds.has(target._id)}
								>
									{processingIds.has(target._id) ? (
										<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
									) : (
										<CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
									)}
									Keep
								</Button>
								<Button
									variant="destructive"
									className="flex-1 rounded-xl h-11 font-semibold transition-all shadow-lg shadow-red-500/20"
									onClick={() => handleApprove(target._id)}
									disabled={processingIds.has(target._id)}
								>
									{processingIds.has(target._id) ? (
										<RefreshCw className="w-4 h-4 mr-2 animate-spin" />
									) : (
										<Trash2 className="w-4 h-4 mr-2" />
									)}
									Prune
								</Button>
							</CardFooter>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
