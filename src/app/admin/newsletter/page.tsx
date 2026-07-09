"use client"

import * as React from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { Link } from "react-router-dom"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"
import {
	Mail,
	Search,
	Send,
	Users,
	UserCircle,
	Loader2,
	CheckCircle2,
	AlertCircle,
	Clock,
	Filter,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

const NEWSLETTER_TIME_ZONE = "America/Los_Angeles"

function getLosAngelesDeliveryDate(now = new Date()) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: NEWSLETTER_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now)

	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
	return `${values.year}-${values.month}-${values.day}`
}

type StatusFilter = "subscribed" | "unsubscribed" | "all"

export default function NewsletterPage() {
	const deliveryDate = React.useMemo(() => getLosAngelesDeliveryDate(), [])
	const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("subscribed")

	const subscribers = useQuery(api.admin.newsletter.getSubscribers, { status: statusFilter })
	const stats = useQuery(api.admin.newsletter.getStats, { deliveryDate })
	const setSubscriptionStatus = useMutation(api.admin.newsletter.setSubscriptionStatus)
	const triggerDailyNewsletter = useAction(api.admin.newsletter.triggerDailyNewsletter)
	const [search, setSearch] = React.useState("")
	const [isTriggering, setIsTriggering] = React.useState(false)
	const [lastTriggerResult, setLastTriggerResult] = React.useState<{
		success: boolean
		skipped: boolean
		message: string
		scheduledBatchCount: number
		pendingCount: number
	} | null>(null)
	const [updatingUserId, setUpdatingUserId] = React.useState<Id<"users"> | null>(null)

	const filteredSubscribers = subscribers?.filter((user) => {
		const query = search.toLowerCase()
		return (
			user.name?.toLowerCase().includes(query) ||
			user.email?.toLowerCase().includes(query)
		)
	}) ?? []

	const handleToggleSubscription = async (
		user: { _id: Id<"users">; email?: string },
		subscribed: boolean,
	) => {
		setUpdatingUserId(user._id)
		try {
			await setSubscriptionStatus({
				userId: user._id,
				status: subscribed ? "subscribed" : "unsubscribed",
			})
			toast.success(
				subscribed
					? `${user.email ?? "User"} subscribed to newsletter`
					: `${user.email ?? "User"} unsubscribed from newsletter`,
			)
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Failed to update subscription"
			toast.error(message)
		} finally {
			setUpdatingUserId(null)
		}
	}

	const handleTriggerNewsletter = async () => {
		if (
			!confirm(
				`Send today's daily newsletter (${deliveryDate}, ${NEWSLETTER_TIME_ZONE}) to all subscribed users?`,
			)
		) {
			return
		}

		setIsTriggering(true)
		setLastTriggerResult(null)
		try {
			const result = await triggerDailyNewsletter({ deliveryDate })
			setLastTriggerResult(result)
			if (result.success && !result.skipped) {
				toast.success(result.message)
			} else if (result.skipped) {
				toast.info(result.message)
			} else {
				toast.error(result.message)
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Failed to trigger newsletter"
			toast.error(message)
		} finally {
			setIsTriggering(false)
		}
	}

	if (!subscribers || !stats) {
		return (
			<div className="flex flex-col gap-4 animate-pulse">
				<div className="h-10 bg-muted rounded w-1/4" />
				<div className="grid gap-4 md:grid-cols-4">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="h-24 bg-muted rounded-xl" />
					))}
				</div>
				<div className="h-64 bg-muted rounded w-full" />
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Newsletter</h2>
					<p className="text-muted-foreground">
						Manage subscriptions and manually trigger the daily icebreaker email.
					</p>
				</div>
				<Button
					onClick={handleTriggerNewsletter}
					disabled={isTriggering}
					className="gap-2"
				>
					{isTriggering ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Send className="size-4" />
					)}
					{isTriggering ? "Sending..." : "Send Daily Newsletter"}
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card className="rounded-2xl border-muted/60">
					<CardHeader className="pb-2">
						<CardDescription>Subscribed</CardDescription>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Users className="size-5 text-green-600" />
							{stats.subscribedCount}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card className="rounded-2xl border-muted/60">
					<CardHeader className="pb-2">
						<CardDescription>Unsubscribed</CardDescription>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Mail className="size-5 text-muted-foreground" />
							{stats.unsubscribedCount}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card className="rounded-2xl border-muted/60">
					<CardHeader className="pb-2">
						<CardDescription>Pending Verification</CardDescription>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Clock className="size-5 text-amber-600" />
							{stats.pendingVerificationCount}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card className="rounded-2xl border-muted/60">
					<CardHeader className="pb-2">
						<CardDescription>Sent Today ({deliveryDate})</CardDescription>
						<CardTitle className="text-2xl flex items-center gap-2">
							<CheckCircle2 className="size-5 text-blue-600" />
							{stats.deliveryCounts.sent}
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0 text-xs text-muted-foreground">
						{stats.deliveryCounts.pending} pending · {stats.deliveryCounts.processing} processing · {stats.deliveryCounts.failed} failed
					</CardContent>
				</Card>
			</div>

			{lastTriggerResult && (
				<Card className={`rounded-2xl ${lastTriggerResult.success ? "border-green-200 bg-green-50/50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}`}>
					<CardContent className="pt-6 flex items-start gap-3">
						{lastTriggerResult.success ? (
							<CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
						) : (
							<AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
						)}
						<div className="space-y-1">
							<p className="font-medium">{lastTriggerResult.message}</p>
							{!lastTriggerResult.skipped && (
								<p className="text-sm text-muted-foreground">
									Scheduled {lastTriggerResult.scheduledBatchCount} batch(es) for {lastTriggerResult.pendingCount} pending delivery(ies).
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			<div className="flex flex-col sm:flex-row gap-3">
				<div className="flex items-center gap-2 flex-1 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
					<Search className="size-4 text-muted-foreground" />
					<Input
						placeholder="Search name or email..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
					/>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="gap-2">
							<Filter className="size-4" />
							{statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => setStatusFilter("subscribed")}>Subscribed</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setStatusFilter("unsubscribed")}>Unsubscribed</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setStatusFilter("all")}>All</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
				<table className="w-full text-sm text-left">
					<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
						<tr>
							<th className="px-6 py-4">User</th>
							<th className="px-6 py-4">Status</th>
							<th className="px-6 py-4 text-right">Subscribed</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{filteredSubscribers.map((user) => {
							const isSubscribed = user.newsletterSubscriptionStatus === "subscribed"
							return (
								<tr key={user._id} className="hover:bg-muted/30 transition-colors">
									<td className="px-6 py-4">
										<div className="flex items-center gap-3">
											<div className="size-10 rounded-full bg-muted flex items-center justify-center border">
												<UserCircle className="size-6 text-muted-foreground" />
											</div>
											<div className="flex flex-col">
												<Link
													to={`/admin/users/${user._id}`}
													className="font-bold hover:underline decoration-blue-500 underline-offset-4"
												>
													{user.name || "Unknown"}
												</Link>
												<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
													<Mail className="size-3" />
													{user.email || "No email"}
												</div>
											</div>
										</div>
									</td>
									<td className="px-6 py-4">
										<Badge
											variant={isSubscribed ? "default" : "secondary"}
											className={isSubscribed ? "bg-green-600 hover:bg-green-700" : ""}
										>
											{user.newsletterSubscriptionStatus ?? "unknown"}
										</Badge>
									</td>
									<td className="px-6 py-4 text-right">
										<Switch
											checked={isSubscribed}
											disabled={updatingUserId === user._id || !user.email}
											onCheckedChange={(checked) => handleToggleSubscription(user, checked)}
										/>
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
				{filteredSubscribers.length === 0 && (
					<div className="py-20 text-center space-y-2">
						<Mail className="size-12 text-muted-foreground/20 mx-auto" />
						<p className="text-lg font-medium">No subscribers found</p>
						<p className="text-muted-foreground">Try a different search or filter.</p>
					</div>
				)}
			</div>
		</div>
	)
}
