"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { Link } from "react-router-dom"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	UserCircle,
	ShieldAlert,
	Search,
	MoreHorizontal,
	Mail,
	Zap,
	ShieldCheck,
	Ban,
	Pencil,
	Eye
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export default function UsersPage() {
	const users = useQuery(api.admin.users.getUsers)
	const makeAdminMutation = useMutation(api.admin.users.makeAdmin)
	const updateUserMutation = useMutation(api.admin.users.updateUser)

	const [search, setSearch] = React.useState("")
	const [editingUserId, setEditingUserId] = React.useState<Id<"users"> | null>(null)
	const [editAiUsage, setEditAiUsage] = React.useState<number>(0)
	const [editNewsletter, setEditNewsletter] = React.useState<boolean>(false)
	const [isSaving, setIsSaving] = React.useState(false)

	const editingUser = React.useMemo(() =>
		users?.find(u => u._id === editingUserId) ?? null
		, [users, editingUserId])

	const filteredUsers = users?.filter(u =>
		u.name?.toLowerCase().includes(search.toLowerCase()) ||
		u.email?.toLowerCase().includes(search.toLowerCase()) ||
		u.phone?.toLowerCase().includes(search.toLowerCase())
	) ?? []

	const handleMakeAdmin = async (email: string) => {
		if (!confirm(`Are you sure you want to grant admin privileges to ${email}?`)) return
		try {
			await makeAdminMutation({ email })
			toast.success("User is now an admin")
		} catch (error: any) {
			toast.error(error.message || "Failed to update permissions")
		}
	}

	const handleEdit = (user: Doc<"users">) => {
		setEditingUserId(user._id)
		setEditAiUsage(user.aiUsage?.count ?? 0)
		setEditNewsletter(user.newsletterSubscriptionStatus === "subscribed")
	}

	const handleSave = async () => {
		if (!editingUserId) return
		setIsSaving(true)
		try {
			await updateUserMutation({
				userId: editingUserId,
				aiUsageCount: editAiUsage,
				newsletterSubscriptionStatus: editNewsletter ? "subscribed" : "unsubscribed",
			})
			toast.success("User updated successfully")
			setEditingUserId(null)
		} catch (error: any) {
			toast.error(error.message || "Failed to update user")
		} finally {
			setIsSaving(false)
		}
	}

	if (!users) {
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
					<h2 className="text-3xl font-bold tracking-tight">Users</h2>
					<p className="text-muted-foreground">Manage user accounts and permissions.</p>
				</div>
			</div>

			<div className="flex items-center gap-2 max-w-md bg-white dark:bg-gray-800 rounded-lg px-3 border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
				<Search className="size-4 text-muted-foreground" />
				<Input
					placeholder="Search name, email, phone..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="border-0 shadow-none focus-visible:ring-0 px-1 py-1"
				/>
			</div>

			<div className="rounded-xl border bg-card shadow-sm overflow-hidden">
				<table className="w-full text-sm text-left">
					<thead className="bg-muted/50 border-b text-muted-foreground font-medium uppercase text-xs tracking-wider">
						<tr>
							<th className="px-6 py-4">User</th>
							<th className="px-6 py-4">Status & Usage</th>
							<th className="px-6 py-4">Subscription</th>
							<th className="px-6 py-4 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{filteredUsers.map((user) => (
							<tr key={user._id} className="hover:bg-muted/30 transition-colors">
								<td className="px-6 py-4">
									<div className="flex items-center gap-3">
										{user.image ? (
											<img src={user.image} className="size-10 rounded-full border shadow-sm" alt={user.name!} />
										) : (
											<div className="size-10 rounded-full bg-muted flex items-center justify-center border">
												<UserCircle className="size-6 text-muted-foreground" />
											</div>
										)}
										<div className="flex flex-col">
											<div className="flex items-center gap-2">
												<Link to={`/admin/users/${user._id}`} className="hover:underline decoration-blue-500 underline-offset-4">
													<span className="font-bold">{user.name || "Unknown"}</span>
												</Link>
												{user.isAdmin && (
													<Badge variant="default" className="bg-blue-500 hover:bg-blue-600 h-4 px-1 text-[8px] uppercase">Admin</Badge>
												)}
											</div>
											<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
												<Mail className="size-3" />
												{user.email || "No email"}
											</div>
										</div>
									</div>
								</td>
								<td className="px-6 py-4">
									<div className="space-y-1">
										<div className="flex items-center gap-2 text-xs">
											<Zap className="size-3 text-amber-500" />
											<span className="font-medium">AI Usage:</span>
											<span className="text-muted-foreground">{user.aiUsage?.count || 0} generations</span>
										</div>
										{user.aiUsage?.cycleStart && (
											<p className="text-[10px] text-muted-foreground ml-5">
												Cycle reset: {new Date(user.aiUsage.cycleStart).toLocaleDateString()}
											</p>
										)}
									</div>
								</td>
								<td className="px-6 py-4">
									<Badge
										variant={user.subscriptionTier === 'casual' ? 'default' : 'secondary'}
										className={`h-5 text-[10px] uppercase tracking-wide ${user.subscriptionTier === 'casual' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
									>
										{user.subscriptionTier || "free"}
									</Badge>
								</td>
								<td className="px-6 py-4 text-right">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="size-8">
												<MoreHorizontal className="size-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-56">
											{!user.isAdmin && (
												<DropdownMenuItem className="gap-2 text-blue-600 focus:text-blue-600" onClick={() => handleMakeAdmin(user.email!)}>
													<ShieldCheck className="size-3.5" />
													Grant Admin Access
												</DropdownMenuItem>
											)}
											<DropdownMenuItem asChild>
												<Link to={`/admin/users/${user._id}`}>
													<Eye className="size-3.5" />
													View Details
												</Link>
											</DropdownMenuItem>
											<DropdownMenuItem className="gap-2" onClick={() => handleEdit(user)}>
												<Pencil className="size-3.5" />
												Edit User
											</DropdownMenuItem>
											<DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
												<Ban className="size-3.5" />
												Suspend User
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{filteredUsers.length === 0 && (
					<div className="py-20 text-center space-y-2">
						<UserCircle className="size-12 text-muted-foreground/20 mx-auto" />
						<p className="text-lg font-medium">No users found</p>
						<p className="text-muted-foreground">Try a different search term.</p>
					</div>
				)}
			</div>

			<Dialog open={!!editingUserId} onOpenChange={(open) => !open && setEditingUserId(null)}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>Edit User</DialogTitle>
						<DialogDescription>
							Update details for {editingUser?.name || editingUser?.email || "this user"}.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="aiUsage">AI Usage Count</Label>
							<Input
								id="aiUsage"
								type="number"
								min={0}
								value={editAiUsage}
								onChange={(e) => setEditAiUsage(Math.max(0, parseInt(e.target.value) || 0))}
							/>
						</div>
						<div className="flex items-center justify-between space-x-2">
							<Label htmlFor="newsletter" className="flex flex-col gap-1">
								<span>Newsletter Subscription</span>
								<span className="font-normal text-xs text-muted-foreground">
									Whether the user receives daily icebreakers.
								</span>
							</Label>
							<Switch
								id="newsletter"
								checked={editNewsletter}
								onCheckedChange={setEditNewsletter}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditingUserId(null)}>Cancel</Button>
						<Button onClick={handleSave} disabled={isSaving}>
							{isSaving ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
