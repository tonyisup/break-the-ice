"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import {
	Settings,
	Save,
	ArrowLeft,
	Info,
	Activity,
	Database,
	Percent,
	Clock,
	AlertTriangle,
	Sparkles,
	Volume2
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"

export default function PruningSettingsPage() {
	const settings = useQuery(api.admin.pruning.getPruningSettings)
	const updateSettings = useMutation(api.admin.pruning.updatePruningSettings)

	const [isSaving, setIsSaving] = React.useState(false)
	const [formData, setFormData] = React.useState({
		minShowsForEngagement: 50,
		minLikeRate: 0.03,
		minShowsForAvgDuration: 20,
		minAvgViewDuration: 2000,
		minHiddenCount: 1,
		minHiddenRate: 0.1,
		minStyleSimilarity: 0.10,
		minToneSimilarity: 0.20,
		enableToneCheck: false,
	})

	React.useEffect(() => {
		if (settings) {
			setFormData({
				minShowsForEngagement: settings.minShowsForEngagement,
				minLikeRate: settings.minLikeRate,
				minShowsForAvgDuration: settings.minShowsForAvgDuration,
				minAvgViewDuration: settings.minAvgViewDuration,
				minHiddenCount: settings.minHiddenCount,
				minHiddenRate: settings.minHiddenRate,
				minStyleSimilarity: settings.minStyleSimilarity,
				minToneSimilarity: settings.minToneSimilarity,
				enableToneCheck: settings.enableToneCheck,
			})
		}
	}, [settings])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)
		try {
			await updateSettings(formData)
			toast.success("Pruning settings updated successfully")
		} catch (error) {
			toast.error("Failed to update settings")
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="space-y-8 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-8">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<Link to="/admin/prune">
							<Button variant="ghost" size="icon" className="rounded-full hover:bg-secondary">
								<ArrowLeft className="w-5 h-5" />
							</Button>
						</Link>
						<div className="p-2 bg-primary/10 rounded-lg">
							<Settings className="w-6 h-6 text-primary" />
						</div>
						<h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
							Pruning Logic Settings
						</h2>
					</div>
					<p className="text-md text-muted-foreground ml-12">
						Control the "Magic Numbers" that decide which questions get flagged for review.
					</p>
				</div>
				<Button
					onClick={handleSubmit}
					disabled={isSaving}
					className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
				>
					{isSaving ? (
						<Activity className="w-4 h-4 mr-2 animate-spin" />
					) : (
						<Save className="w-4 h-4 mr-2" />
					)}
					Save Configuration
				</Button>
			</div>

			<form onSubmit={handleSubmit} className="grid gap-8">
				{/* Engagement Thresholds */}
				<Card className="border-2 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="bg-secondary/10 border-b">
						<div className="flex items-center gap-2">
							<Activity className="w-5 h-5 text-primary" />
							<CardTitle>Engagement Thresholds</CardTitle>
						</div>
						<CardDescription>Determine when a question is considered "low performing" based on user interaction.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="grid sm:grid-cols-2 gap-6">
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minShowsForEngagement" className="text-sm font-bold flex items-center gap-2">
										<Database className="w-4 h-4 text-muted-foreground" />
										Minimum Shows for Engagement
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{formData.minShowsForEngagement}</span>
								</div>
								<Input
									id="minShowsForEngagement"
									type="number"
									value={formData.minShowsForEngagement}
									onChange={(e) => setFormData(prev => ({ ...prev, minShowsForEngagement: parseInt(e.target.value) || 0 }))}
									className="rounded-xl border-2"
								/>
								<p className="text-[11px] text-muted-foreground italic">Required exposure before checking like rates.</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minLikeRate" className="text-sm font-bold flex items-center gap-2">
										<Percent className="w-4 h-4 text-muted-foreground" />
										Minimum Like Rate
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{(formData.minLikeRate * 100).toFixed(1)}%</span>
								</div>
								<div className="pt-2 flex items-center gap-4">
									<Slider
										value={[formData.minLikeRate * 100]}
										onValueChange={([val]) => setFormData(prev => ({ ...prev, minLikeRate: val / 100 }))}
										min={0}
										max={20}
										step={0.5}
										className="flex-grow"
									/>
									<Input
										type="number"
										value={(formData.minLikeRate * 100).toFixed(1)}
										onChange={(e) => setFormData(prev => ({ ...prev, minLikeRate: parseFloat(e.target.value) / 100 || 0 }))}
										className="w-20 rounded-xl border-2 h-9 text-xs"
										step="0.1"
									/>
								</div>
								<p className="text-[11px] text-muted-foreground italic">Flag questions with a like/show ratio below this value.</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minShowsForAvgDuration" className="text-sm font-bold flex items-center gap-2">
										<Clock className="w-4 h-4 text-muted-foreground" />
										Shows for Duration Check
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{formData.minShowsForAvgDuration}</span>
								</div>
								<Input
									id="minShowsForAvgDuration"
									type="number"
									value={formData.minShowsForAvgDuration}
									onChange={(e) => setFormData(prev => ({ ...prev, minShowsForAvgDuration: parseInt(e.target.value) || 0 }))}
									className="rounded-xl border-2"
								/>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minAvgViewDuration" className="text-sm font-bold flex items-center gap-2">
										<Clock className="w-4 h-4 text-muted-foreground" />
										Minimum View Duration (ms)
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{(formData.minAvgViewDuration / 1000).toFixed(1)}s</span>
								</div>
								<Input
									id="minAvgViewDuration"
									type="number"
									value={formData.minAvgViewDuration}
									onChange={(e) => setFormData(prev => ({ ...prev, minAvgViewDuration: parseInt(e.target.value) || 0 }))}
									className="rounded-xl border-2"
									step="100"
								/>
								<p className="text-[11px] text-muted-foreground italic">Flag if avg. interaction time is too short.</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Hidden/Abuse Thresholds */}
				<Card className="border-2 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="bg-secondary/10 border-b">
						<div className="flex items-center gap-2">
							<AlertTriangle className="w-5 h-5 text-yellow-500" />
							<CardTitle>Hidden & Dismissal Logic</CardTitle>
						</div>
						<CardDescription>Configure sensitivity for user "Hidden" actions.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-6">
						<div className="grid sm:grid-cols-2 gap-6">
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minHiddenCount" className="text-sm font-bold flex items-center gap-2">
										<Database className="w-4 h-4 text-muted-foreground" />
										Absolute Hidden Count
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{formData.minHiddenCount}</span>
								</div>
								<Input
									id="minHiddenCount"
									type="number"
									value={formData.minHiddenCount}
									onChange={(e) => setFormData(prev => ({ ...prev, minHiddenCount: parseInt(e.target.value) || 0 }))}
									className="rounded-xl border-2"
								/>
								<p className="text-[11px] text-muted-foreground italic">Flag if hidden by this many individual users regardless of exposure.</p>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label htmlFor="minHiddenRate" className="text-sm font-bold flex items-center gap-2">
										<Percent className="w-4 h-4 text-muted-foreground" />
										Hidden Rate Threshold
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{(formData.minHiddenRate * 100).toFixed(1)}%</span>
								</div>
								<div className="pt-2 flex items-center gap-4">
									<Slider
										value={[formData.minHiddenRate * 100]}
										onValueChange={([val]) => setFormData(prev => ({ ...prev, minHiddenRate: val / 100 }))}
										min={0}
										max={50}
										step={1}
										className="flex-grow"
									/>
									<Input
										type="number"
										value={(formData.minHiddenRate * 100).toFixed(1)}
										onChange={(e) => setFormData(prev => ({ ...prev, minHiddenRate: parseFloat(e.target.value) / 100 || 0 }))}
										className="w-20 rounded-xl border-2 h-9 text-xs"
									/>
								</div>
								<p className="text-[11px] text-muted-foreground italic">Flag if percentage of users hiding vs showing exceeds this.</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* AI Similarity Thresholds */}
				<Card className="border-2 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
					<CardHeader className="bg-secondary/10 border-b">
						<div className="flex items-center gap-2">
							<Sparkles className="w-5 h-5 text-purple-500" />
							<CardTitle>Semantic Alignment (AI)</CardTitle>
						</div>
						<CardDescription>Determine how strictly questions must align with their assigned Style and Tone.</CardDescription>
					</CardHeader>
					<CardContent className="pt-6 space-y-8">
						<div className="grid sm:grid-cols-2 gap-8">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-bold flex items-center gap-2">
										<Activity className="w-4 h-4 text-muted-foreground" />
										Minimum Style Similarity
									</Label>
									<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{formData.minStyleSimilarity.toFixed(2)}</span>
								</div>
								<Slider
									value={[formData.minStyleSimilarity]}
									onValueChange={([val]) => setFormData(prev => ({ ...prev, minStyleSimilarity: val }))}
									min={0}
									max={1}
									step={0.05}
								/>
								<p className="text-[11px] text-muted-foreground italic leading-relaxed">
									Cosine similarity between question and Style embeddings.
									<br />Higher = stricter requirement for style consistency.
								</p>
							</div>

							<div className="space-y-4">
								<div className="flex items-center justify-between gap-4">
									<Label className="text-sm font-bold flex items-center gap-2">
										<Volume2 className="w-4 h-4 text-muted-foreground" />
										Tone Check
									</Label>
									<div className="flex items-center gap-2">
										<span className="text-[10px] font-bold uppercase text-muted-foreground">{formData.enableToneCheck ? "Enabled" : "Disabled"}</span>
										<Switch
											checked={formData.enableToneCheck}
											onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enableToneCheck: checked }))}
										/>
									</div>
								</div>
								<Separator className="my-2" />
								<div className={`space-y-4 transition-opacity duration-300 ${formData.enableToneCheck ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
									<div className="flex items-center justify-between">
										<Label className="text-xs font-bold text-muted-foreground">Minimum Tone Similarity</Label>
										<span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{formData.minToneSimilarity.toFixed(2)}</span>
									</div>
									<Slider
										value={[formData.minToneSimilarity]}
										onValueChange={([val]) => setFormData(prev => ({ ...prev, minToneSimilarity: val }))}
										min={0}
										max={1}
										step={0.05}
									/>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</form>

			<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 flex gap-4 items-start">
				<div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
					<Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
				</div>
				<div className="space-y-1">
					<h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">Pro Tip</h4>
					<p className="text-sm text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
						Changes take effect immediately for the next scheduled or manual pruning scan.
						Recommended "Minimum Style Similarity" is <b>0.65 - 0.75</b> for high quality control, or <b>0.10</b> to effectively disable it.
					</p>
				</div>
			</div>
		</div>
	)
}
