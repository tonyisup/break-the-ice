"use client"

import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { Id } from "../../../../../convex/_generated/dataModel"
import {
	ChevronLeft,
	Save,
	Loader2,
	Sparkles,
	Eye,
	Heart,
	Share2,
	EyeOff,
	Clock,
	Users,
	TrendingUp,
	BarChart3,
	Tag,
	Hash,
	Calendar,
	Activity,
	Send,
	Image,
} from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Icon, IconComponent } from "@/components/ui/icons/icon"
import { cn } from "@/lib/utils"

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
	label,
	value,
	icon: IconEl,
	color = "text-foreground",
	sub,
}: {
	label: string
	value: string | number
	icon: React.ComponentType<{ className?: string }>
	color?: string
	sub?: string
}) {
	return (
		<div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all hover:shadow-md group">
			<div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
			<div className="flex items-center gap-3">
				<div className={cn("rounded-lg p-2.5 bg-muted/80", color)}>
					<IconEl className="size-4" />
				</div>
				<div className="min-w-0">
					<p className="text-2xl font-bold tracking-tight">{value}</p>
					<p className="text-xs text-muted-foreground font-medium">{label}</p>
					{sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
				</div>
			</div>
		</div>
	)
}

// ─── Mini Bar Chart (pure CSS) ────────────────────────────────────────────────
function MiniBarChart({ data, maxVal }: { data: { label: string; value: number; color: string }[]; maxVal: number }) {
	return (
		<div className="flex items-end gap-1 h-20">
			{data.map((d, i) => (
				<div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
					<div
						className="w-full rounded-t-sm transition-all duration-300"
						style={{
							height: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`,
							minHeight: d.value > 0 ? "4px" : "0",
							backgroundColor: d.color,
						}}
					/>
					<span className="text-[8px] text-muted-foreground truncate w-full text-center">{d.label}</span>
				</div>
			))}
		</div>
	)
}

// ─── Status Distribution Bar ──────────────────────────────────────────────────
function StatusBar({ distribution }: { distribution: Record<string, number> }) {
	const total = Object.values(distribution).reduce((a, b) => a + b, 0)
	if (total === 0) return <p className="text-sm text-muted-foreground italic">No user interaction data yet.</p>

	const colors: Record<string, string> = {
		unseen: "#94a3b8",
		seen: "#60a5fa",
		liked: "#f472b6",
		hidden: "#fb923c",
		sent: "#34d399",
	}

	return (
		<div className="space-y-3">
			<div className="flex rounded-full h-3 overflow-hidden bg-muted">
				{Object.entries(distribution).map(([status, count]) =>
					count > 0 ? (
						<div
							key={status}
							className="transition-all duration-500"
							style={{ width: `${(count / total) * 100}%`, backgroundColor: colors[status] || "#666" }}
							title={`${status}: ${count}`}
						/>
					) : null
				)}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{Object.entries(distribution).map(([status, count]) => (
					<div key={status} className="flex items-center gap-1.5 text-xs">
						<div className="size-2 rounded-full" style={{ backgroundColor: colors[status] || "#666" }} />
						<span className="capitalize text-muted-foreground">{status}</span>
						<span className="font-semibold">{count}</span>
					</div>
				))}
			</div>
		</div>
	)
}

// ─── Daily Activity Chart ─────────────────────────────────────────────────────
function DailyChart({ data }: { data: { date: string; seen: number; liked: number; shared: number; hidden: number }[] }) {
	if (!data || data.length === 0) {
		return <p className="text-sm text-muted-foreground italic py-8 text-center">No activity in the last 30 days.</p>
	}

	const maxVal = Math.max(...data.map(d => d.seen + d.liked + d.shared + d.hidden), 1)

	return (
		<div className="space-y-3">
			<div className="flex items-end gap-[2px] h-32">
				{data.map((d, i) => {
					const total = d.seen + d.liked + d.shared + d.hidden
					return (
						<div
							key={i}
							className="flex-1 min-w-0 group relative"
							title={`${d.date}\nSeen: ${d.seen} | Liked: ${d.liked} | Shared: ${d.shared} | Hidden: ${d.hidden}`}
						>
							<div className="flex flex-col-reverse h-32">
								{d.seen > 0 && (
									<div
										className="bg-blue-400/80 transition-all rounded-t-[1px] first:rounded-b-[1px]"
										style={{ height: `${(d.seen / maxVal) * 100}%` }}
									/>
								)}
								{d.liked > 0 && (
									<div className="bg-pink-400/80 transition-all" style={{ height: `${(d.liked / maxVal) * 100}%` }} />
								)}
								{d.shared > 0 && (
									<div className="bg-emerald-400/80 transition-all" style={{ height: `${(d.shared / maxVal) * 100}%` }} />
								)}
								{d.hidden > 0 && (
									<div className="bg-orange-400/80 transition-all rounded-t-[1px]" style={{ height: `${(d.hidden / maxVal) * 100}%` }} />
								)}
							</div>
						</div>
					)
				})}
			</div>
			<div className="flex justify-between text-[10px] text-muted-foreground">
				<span>{data[0]?.date.slice(5)}</span>
				<span>{data[data.length - 1]?.date.slice(5)}</span>
			</div>
			<div className="flex gap-4 text-xs">
				<span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-400" /> Seen</span>
				<span className="flex items-center gap-1"><span className="size-2 rounded-full bg-pink-400" /> Liked</span>
				<span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> Shared</span>
				<span className="flex items-center gap-1"><span className="size-2 rounded-full bg-orange-400" /> Hidden</span>
			</div>
		</div>
	)
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuestionDetailsPage() {
	const { questionId } = useParams<{ questionId: string }>()
	const id = questionId as Id<"questions">

	const question = useQuery(api.admin.questions.getQuestionById, id ? { id } : "skip")
	const analytics = useQuery(api.admin.questions.getQuestionAnalytics, id ? { questionId: id } : "skip")
	const styles = useQuery(api.core.styles.getStyles, {})
	const tones = useQuery(api.core.tones.getTones, {})
	const topics = useQuery(api.admin.topics.getTopics)

	const updateQuestion = useMutation(api.admin.questions.updateQuestion)
	const remixQuestion = useAction(api.admin.questions.remixQuestion)

	// ── Editing State ──
	const [editText, setEditText] = useState("")
	const [editStyle, setEditStyle] = useState("")
	const [editTone, setEditTone] = useState("")
	const [editTopic, setEditTopic] = useState("")
	const [editStatus, setEditStatus] = useState("")
	const [editTags, setEditTags] = useState("")
	const [tagInput, setTagInput] = useState("")

	const [saving, setSaving] = useState(false)
	const [remixing, setRemixing] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)

	const hasInitialized = useRef(false)

	const handleReset = () => {
		if (question) {
			setEditText(question.text || question.customText || "")
			setEditStyle(question.style || "")
			setEditTone(question.tone || "")
			setEditTopic(question.topic || "")
			setEditStatus(question.status || "public")
			setEditTags((question.tags || []).join(", "))
			toast.info("Form reset to database version")
		}
	}

	// Populate form when question loads (only once)
	useEffect(() => {
		if (question && !hasInitialized.current) {
			setEditText(question.text || question.customText || "")
			setEditStyle(question.style || "")
			setEditTone(question.tone || "")
			setEditTopic(question.topic || "")
			setEditStatus(question.status || "public")
			setEditTags((question.tags || []).join(", "))
			hasInitialized.current = true
		}
	}, [question])

	// Track changes
	useEffect(() => {
		if (!question) return
		const original = {
			text: question.text || question.customText || "",
			style: question.style || "",
			tone: question.tone || "",
			topic: question.topic || "",
			status: question.status || "public",
			tags: (question.tags || []).join(", "),
		}
		const changed =
			editText !== original.text ||
			editStyle !== original.style ||
			editTone !== original.tone ||
			editTopic !== original.topic ||
			editStatus !== original.status ||
			editTags !== original.tags
		setHasChanges(changed)
	}, [editText, editStyle, editTone, editTopic, editStatus, editTags, question])

	const handleSave = async () => {
		if (!question) return
		setSaving(true)
		try {
			const tags = editTags
				.split(",")
				.map(t => t.trim())
				.filter(Boolean)

			await updateQuestion({
				id: question._id,
				text: editText || undefined,
				style: editStyle || undefined,
				tone: editTone || undefined,
				topic: editTopic || undefined,
				status: (editStatus as any) || undefined,
				tags,
			})
			toast.success("Question updated successfully")
			setHasChanges(false)
		} catch (error) {
			toast.error("Failed to update question")
		} finally {
			setSaving(false)
		}
	}

	const handleRemix = async () => {
		if (!question) return
		setRemixing(true)
		try {
			const newText = await remixQuestion({ id: question._id })
			if (window.confirm(`Review the remixed question:\n\n"${newText}"\n\nApply this change?`)) {
				setEditText(newText)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			toast.error(`Remix failed: ${message}`)
		} finally {
			setRemixing(false)
		}
	}

	const handleAddTag = () => {
		if (!tagInput.trim()) return
		const current = editTags
			.split(",")
			.map(t => t.trim())
			.filter(Boolean)
		if (!current.includes(tagInput.trim())) {
			setEditTags([...current, tagInput.trim()].join(", "))
		}
		setTagInput("")
	}

	const handleRemoveTag = (tag: string) => {
		const current = editTags
			.split(",")
			.map(t => t.trim())
			.filter(t => t !== tag)
		setEditTags(current.join(", "))
	}

	// ── Loading / Not Found ──
	if (question === undefined) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-8 bg-muted rounded w-48" />
				<div className="h-64 bg-muted rounded" />
			</div>
		)
	}

	if (question === null) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-4">
				<p className="text-lg font-medium text-muted-foreground">Question not found</p>
				<Link to="/admin/questions">
					<Button variant="outline" className="gap-2">
						<ChevronLeft className="size-4" /> Back to Questions
					</Button>
				</Link>
			</div>
		)
	}

	const tags = editTags
		.split(",")
		.map(t => t.trim())
		.filter(Boolean)

	const styleMeta = question._style
	const toneMeta = question._tone
	const topicMeta = question._topic

	const likeRate = question.totalShows > 0 ? ((question.totalLikes / question.totalShows) * 100).toFixed(1) : "0"

	return (
		<div className="space-y-6 max-w-5xl">
			{/* ── Header ── */}
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<Link to="/admin/questions">
						<Button variant="ghost" size="icon" className="size-9">
							<ChevronLeft className="size-5" />
						</Button>
					</Link>
					<div>
						<h2 className="text-2xl font-bold tracking-tight">Question Details</h2>
						<code className="text-xs text-muted-foreground">{question._id}</code>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<a
						href={`/api/og_question?id=${question._id}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button
							variant="outline"
							size="sm"
							className="gap-2"
							type="button"
						>
							<Image className="size-4" />
							View Image
						</Button>
					</a>

					<Button
						variant="outline"
						size="sm"
						className="gap-2 text-blue-500 hover:text-blue-600"
						onClick={handleRemix}
						disabled={remixing}
					>
						{remixing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
						Remix with AI
					</Button>

					<Button
						variant="outline"
						size="sm"
						className="gap-2"
						onClick={handleReset}
						title="Reset form to database version"
					>
						<Activity className="size-4" />
						Reset
					</Button>

					<Button size="sm" className="gap-2" onClick={handleSave} disabled={saving || !hasChanges}>
						{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
						Save Changes
					</Button>
				</div>
			</div>

			{/* ── Quick Stats Row ── */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<StatCard label="Total Shows" value={question.totalShows} icon={Eye} color="text-blue-500" />
				<StatCard label="Total Likes" value={question.totalLikes} icon={Heart} color="text-pink-500" />
				<StatCard label="Like Rate" value={`${likeRate}%`} icon={TrendingUp} color="text-emerald-500" />
				<StatCard
					label="Avg View Duration"
					value={question.averageViewDuration > 0 ? `${(question.averageViewDuration / 1000).toFixed(1)}s` : "—"}
					icon={Clock}
					color="text-amber-500"
				/>
			</div>

			{/* ── Tabs ── */}
			<Tabs defaultValue="details" className="space-y-6">
				<TabsList className="bg-muted/50 border p-1 h-auto">
					<TabsTrigger value="details" className="gap-2 data-[state=active]:bg-background">
						<Tag className="size-3.5" /> Details
					</TabsTrigger>
					<TabsTrigger value="stats" className="gap-2 data-[state=active]:bg-background">
						<BarChart3 className="size-3.5" /> Stats
					</TabsTrigger>
					<TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-background">
						<Activity className="size-3.5" /> Analytics
					</TabsTrigger>
				</TabsList>

				{/* ─────────────── DETAILS TAB ─────────────── */}
				<TabsContent value="details" className="space-y-6">
					{/* Question Text */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<label className="text-sm font-semibold text-foreground flex items-center gap-2">
							<Hash className="size-4 text-muted-foreground" />
							Question Text
						</label>
						<textarea
							className="w-full min-h-[120px] p-4 rounded-lg border bg-background text-base leading-relaxed font-medium focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all"
							value={editText}
							onChange={(e) => setEditText(e.target.value)}
							placeholder="Enter question text..."
						/>
						<p className="text-xs text-muted-foreground">
							{editText.length} characters · Created {new Date(question._creationTime).toLocaleDateString()}
						</p>
					</div>

					{/* Classification Grid */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Style */}
						<div className="rounded-xl border bg-card p-5 space-y-3">
							<label className="text-sm font-semibold text-foreground">Style</label>
							<select
								value={editStyle}
								onChange={(e) => setEditStyle(e.target.value)}
								className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
							>
								<option value="">No Style</option>
								{styles?.map(s => (
									<option key={s.id} value={s.id}>{s.name}</option>
								))}
							</select>
							{styleMeta && (
								<Badge
									variant="outline"
									className="gap-1.5 font-medium py-1"
									style={{ borderColor: `${styleMeta.color}40`, backgroundColor: `${styleMeta.color}10`, color: styleMeta.color }}
								>
									<IconComponent icon={styleMeta.icon as Icon} size={14} color={styleMeta.color} />
									{styleMeta.name}
								</Badge>
							)}
						</div>

						{/* Tone */}
						<div className="rounded-xl border bg-card p-5 space-y-3">
							<label className="text-sm font-semibold text-foreground">Tone</label>
							<select
								value={editTone}
								onChange={(e) => setEditTone(e.target.value)}
								className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
							>
								<option value="">No Tone</option>
								{tones?.map(t => (
									<option key={t.id} value={t.id}>{t.name}</option>
								))}
							</select>
							{toneMeta && (
								<Badge
									variant="outline"
									className="gap-1.5 font-medium py-1"
									style={{ borderColor: `${toneMeta.color}40`, backgroundColor: `${toneMeta.color}10`, color: toneMeta.color }}
								>
									<IconComponent icon={toneMeta.icon as Icon} size={14} color={toneMeta.color} />
									{toneMeta.name}
								</Badge>
							)}
						</div>

						{/* Topic */}
						<div className="rounded-xl border bg-card p-5 space-y-3">
							<label className="text-sm font-semibold text-foreground">Topic</label>
							<select
								value={editTopic}
								onChange={(e) => setEditTopic(e.target.value)}
								className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
							>
								<option value="">No Topic</option>
								{topics?.map(t => (
									<option key={t.id} value={t.id}>{t.name}</option>
								))}
							</select>
							{topicMeta && (
								<Badge variant="secondary" className="gap-1.5 font-medium py-1">
									{topicMeta.name}
								</Badge>
							)}
						</div>

						{/* Status */}
						<div className="rounded-xl border bg-card p-5 space-y-3">
							<label className="text-sm font-semibold text-foreground">Status</label>
							<select
								value={editStatus}
								onChange={(e) => setEditStatus(e.target.value)}
								className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
							>
								<option value="pending">Pending</option>
								<option value="approved">Approved</option>
								<option value="public">Public</option>
								<option value="private">Private</option>
								<option value="pruning">Pruning</option>
								<option value="pruned">Pruned</option>
							</select>
							<Badge variant="secondary" className="capitalize text-xs">{editStatus}</Badge>
						</div>
					</div>

					{/* Tags */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<label className="text-sm font-semibold text-foreground flex items-center gap-2">
							<Tag className="size-4 text-muted-foreground" />
							Tags
						</label>
						<div className="flex flex-wrap gap-2">
							{tags.map(tag => (
								<Badge
									key={tag}
									variant="secondary"
									className="gap-1.5 pr-1.5 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
									onClick={() => handleRemoveTag(tag)}
								>
									{tag}
									<span className="text-xs opacity-50">×</span>
								</Badge>
							))}
							{tags.length === 0 && <span className="text-sm text-muted-foreground italic">No tags assigned</span>}
						</div>
						<div className="flex gap-2">
							<Input
								value={tagInput}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault()
										handleAddTag()
									}
								}}
								placeholder="Add a tag..."
								className="max-w-xs"
							/>
							<Button variant="outline" size="sm" onClick={handleAddTag} disabled={!tagInput.trim()}>
								Add
							</Button>
						</div>
					</div>

					{/* Metadata */}
					<div className="rounded-xl border bg-card p-6 space-y-3">
						<label className="text-sm font-semibold text-foreground flex items-center gap-2">
							<Calendar className="size-4 text-muted-foreground" />
							Metadata
						</label>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
							<div>
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Created</p>
								<p className="font-medium">{new Date(question._creationTime).toLocaleString()}</p>
							</div>
							<div>
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Last Shown</p>
								<p className="font-medium">{question.lastShownAt ? new Date(question.lastShownAt).toLocaleString() : "Never"}</p>
							</div>
							<div>
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">AI Generated</p>
								<p className="font-medium">{question.isAIGenerated ? "Yes" : "No"}</p>
							</div>
							<div>
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Pool Date</p>
								<p className="font-medium">{question.poolDate || "—"}</p>
							</div>
						</div>
					</div>
				</TabsContent>

				{/* ─────────────── STATS TAB ─────────────── */}
				<TabsContent value="stats" className="space-y-6">
					{/* Core Metrics */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						<StatCard label="Views (analytics)" value={analytics?.totals.seen ?? "—"} icon={Eye} color="text-blue-500" />
						<StatCard label="Likes (analytics)" value={analytics?.totals.liked ?? "—"} icon={Heart} color="text-pink-500" />
						<StatCard label="Shares" value={analytics?.totals.shared ?? "—"} icon={Share2} color="text-emerald-500" />
						<StatCard label="Hidden" value={analytics?.totals.hidden ?? "—"} icon={EyeOff} color="text-orange-500" />
					</div>

					{/* View Duration */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<h3 className="text-sm font-semibold flex items-center gap-2">
							<Clock className="size-4 text-muted-foreground" />
							View Duration
						</h3>
						<div className="grid grid-cols-3 gap-6">
							<div>
								<p className="text-2xl font-bold">{analytics?.viewDuration.average ? `${(analytics.viewDuration.average / 1000).toFixed(1)}s` : "—"}</p>
								<p className="text-xs text-muted-foreground">Average</p>
							</div>
							<div>
								<p className="text-2xl font-bold">{analytics?.viewDuration.max ? `${(analytics.viewDuration.max / 1000).toFixed(1)}s` : "—"}</p>
								<p className="text-xs text-muted-foreground">Max</p>
							</div>
							<div>
								<p className="text-2xl font-bold">{analytics?.viewDuration.totalViews ?? "—"}</p>
								<p className="text-xs text-muted-foreground">Views with Duration</p>
							</div>
						</div>
					</div>

					{/* Reach */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<h3 className="text-sm font-semibold flex items-center gap-2">
							<Users className="size-4 text-muted-foreground" />
							Reach
						</h3>
						<div className="grid grid-cols-2 gap-6">
							<div>
								<p className="text-2xl font-bold">{analytics?.reach.uniqueUsers ?? "—"}</p>
								<p className="text-xs text-muted-foreground">Unique Users</p>
							</div>
							<div>
								<p className="text-2xl font-bold">{analytics?.reach.uniqueSessions ?? "—"}</p>
								<p className="text-xs text-muted-foreground">Unique Sessions</p>
							</div>
						</div>
					</div>

					{/* User Status Distribution */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<h3 className="text-sm font-semibold flex items-center gap-2">
							<Send className="size-4 text-muted-foreground" />
							User Question Status Distribution
						</h3>
						{analytics?.userStatusDistribution ? (
							<StatusBar distribution={analytics.userStatusDistribution} />
						) : (
							<p className="text-sm text-muted-foreground italic">Loading...</p>
						)}
					</div>
				</TabsContent>

				{/* ─────────────── ANALYTICS TAB ─────────────── */}
				<TabsContent value="analytics" className="space-y-6">
					{/* Daily Activity */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<h3 className="text-sm font-semibold flex items-center gap-2">
							<Activity className="size-4 text-muted-foreground" />
							Daily Activity (Last 30 Days)
						</h3>
						{analytics?.dailyBreakdown ? (
							<DailyChart data={analytics.dailyBreakdown} />
						) : (
							<div className="h-32 flex items-center justify-center">
								<Loader2 className="size-5 animate-spin text-muted-foreground" />
							</div>
						)}
					</div>

					{/* Engagement Summary */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="rounded-xl border bg-card p-6 space-y-4">
							<h3 className="text-sm font-semibold">Engagement Rate</h3>
							{analytics ? (
								<>
									<p className="text-4xl font-bold text-primary">
										{analytics.totals.seen > 0
											? `${((analytics.totals.liked / analytics.totals.seen) * 100).toFixed(1)}%`
											: "—"}
									</p>
									<p className="text-xs text-muted-foreground">
										Ratio of likes to views from analytics events
									</p>
								</>
							) : (
								<div className="h-16 bg-muted rounded animate-pulse" />
							)}
						</div>

						<div className="rounded-xl border bg-card p-6 space-y-4">
							<h3 className="text-sm font-semibold">Hide Rate</h3>
							{analytics ? (
								<>
									<p className="text-4xl font-bold text-orange-500">
										{analytics.totals.seen > 0
											? `${((analytics.totals.hidden / analytics.totals.seen) * 100).toFixed(1)}%`
											: "—"}
									</p>
									<p className="text-xs text-muted-foreground">
										Ratio of hides to views — high values may indicate issues
									</p>
								</>
							) : (
								<div className="h-16 bg-muted rounded animate-pulse" />
							)}
						</div>
					</div>

					{/* Raw Event Totals */}
					<div className="rounded-xl border bg-card p-6 space-y-4">
						<h3 className="text-sm font-semibold">All-Time Event Totals</h3>
						{analytics ? (
							<MiniBarChart
								maxVal={Math.max(analytics.totals.seen, analytics.totals.liked, analytics.totals.shared, analytics.totals.hidden, 1)}
								data={[
									{ label: "Seen", value: analytics.totals.seen, color: "#60a5fa" },
									{ label: "Liked", value: analytics.totals.liked, color: "#f472b6" },
									{ label: "Shared", value: analytics.totals.shared, color: "#34d399" },
									{ label: "Hidden", value: analytics.totals.hidden, color: "#fb923c" },
								]}
							/>
						) : (
							<div className="h-20 bg-muted rounded animate-pulse" />
						)}
					</div>
				</TabsContent>
			</Tabs>

			{/* Save Bar (sticky) */}
			{hasChanges && (
				<div className="sticky bottom-4 z-20">
					<div className="flex items-center justify-between px-5 py-3 bg-primary text-primary-foreground rounded-xl shadow-2xl border border-primary/20 animate-in slide-in-from-bottom-2 duration-300">
						<p className="text-sm font-medium">You have unsaved changes</p>
						<div className="flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								onClick={handleReset}
							>
								Discard
							</Button>
							<Button variant="secondary" size="sm" className="gap-2 bg-white text-primary hover:bg-white/90" onClick={handleSave} disabled={saving}>
								{saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
								Save
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
