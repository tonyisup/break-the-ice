"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { Id } from "../../../../../convex/_generated/dataModel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, Save, Loader2, UserCircle, Mail, Search, Filter, X } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { useState, useEffect } from "react"
import { toast } from "sonner"

interface PreferenceItem {
    _id: string;
    status: string;
    updatedAt: number;
    style?: { name: string; icon: string; [key: string]: unknown } | null;
    tone?: { name: string; icon: string; [key: string]: unknown } | null;
}

function PreferenceGrid({
    items,
    type,
    loading
}: {
    items: PreferenceItem[] | undefined,
    type: "style" | "tone",
    loading: boolean
}) {
    if (loading) {
        return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" /></div>
    }

    if (!items || items.length === 0) {
        return <div className="text-muted-foreground text-center py-8">No {type} preferences recorded.</div>
    }

    return (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(item => {
                const entity = type === 'style' ? item.style : item.tone
                const label = type === 'style' ? "Unknown Style" : "Unknown Tone"

                return (
                    <div key={item._id} className="flex justify-between items-center p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl p-1 bg-muted rounded">{entity?.icon || "?"}</span>
                            <div className="flex flex-col">
                                <span className="font-medium text-sm">{entity?.name || label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(item.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <Badge variant={item.status === 'preferred' ? 'default' : 'secondary'} className={item.status === 'preferred' ? 'bg-green-600 hover:bg-green-700' : ''}>
                            {item.status}
                        </Badge>
                    </div>
                )
            })}
        </div>
    )
}

export default function UserDetailsPage() {
    const { userId } = useParams<{ userId: string }>()
    const userIdTyped = userId as Id<"users">

    // Queries
    const user = useQuery(api.admin.users.getUser, userIdTyped ? { userId: userIdTyped } : "skip")
    const styles = useQuery(api.admin.users.getUserStyles, userIdTyped ? { userId: userIdTyped } : "skip")
    const tones = useQuery(api.admin.users.getUserTones, userIdTyped ? { userId: userIdTyped } : "skip")
    const questions = useQuery(api.admin.users.getUserQuestions, userIdTyped ? { userId: userIdTyped } : "skip")

    const updateUser = useMutation(api.admin.users.updateUser)

    // State for editing
    const [aiUsage, setAiUsage] = useState(0)
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [filterStatus, setFilterStatus] = useState<string>("all")

    useEffect(() => {
        if (user) {
            setAiUsage(user.aiUsage?.count ?? 0)
            setIsSubscribed(user.newsletterSubscriptionStatus === "subscribed")
        }
    }, [user])

    const filteredQuestions = questions?.filter(q => {
        const text = (q.question?.text || q.question?.customText || "").toLowerCase()
        const matchesSearch = text.includes(searchTerm.toLowerCase())
        const matchesStatus = filterStatus === "all" || q.status === filterStatus
        return matchesSearch && matchesStatus
    })

    const questionStatuses = questions ? Array.from(new Set(questions.map(q => q.status))) : []

    const handleSave = async () => {
        if (!userIdTyped) return;
        setIsSaving(true)
        try {
            await updateUser({
                userId: userIdTyped,
                aiUsageCount: aiUsage,
                newsletterSubscriptionStatus: isSubscribed ? "subscribed" : "unsubscribed"
            })
            toast.success("User updated")
        } catch (e) {
            toast.error("Failed to update user")
        } finally {
            setIsSaving(false)
        }
    }

    if (!userIdTyped) {
         return (
            <div className="flex items-center justify-center h-96">
                <div>Invalid User ID</div>
            </div>
        )
    }

    if (user === undefined) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (user === null) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-muted-foreground">User not found</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 container mx-auto py-6">
            <div className="flex items-center gap-4">
                 <Link to="/admin/users">
                    <Button variant="outline" size="icon">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex items-center gap-3">
                    {user.image ? (
                        <img src={user.image} className="h-10 w-10 rounded-full border shadow-sm" alt={user.name || "User"} />
                    ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border">
                            <UserCircle className="h-6 w-6 text-muted-foreground" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{user.name || "User Details"}</h1>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="size-3" />
                            {user.email || "No email"}
                        </div>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4 max-w-[600px]">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="styles">Styles</TabsTrigger>
                    <TabsTrigger value="tones">Tones</TabsTrigger>
                    <TabsTrigger value="questions">Questions</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>User Information</CardTitle>
                                <CardDescription>Basic details about the user account.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 text-sm">
                                    <div className="grid grid-cols-3 gap-4 border-b pb-2">
                                        <div className="font-medium text-muted-foreground">Joined</div>
                                        <div className="col-span-2">{new Date(user._creationTime).toLocaleDateString()}</div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 border-b pb-2">
                                        <div className="font-medium text-muted-foreground">Role</div>
                                        <div className="col-span-2">
                                            {user.isAdmin ? (
                                                <Badge variant="default" className="bg-blue-500">Admin</Badge>
                                            ) : (
                                                <Badge variant="secondary">User</Badge>
                                            )}
                                        </div>
                                    </div>
                                     <div className="grid grid-cols-3 gap-4 border-b pb-2">
                                        <div className="font-medium text-muted-foreground">Tier</div>
                                        <div className="col-span-2">
                                            <Badge variant={user.subscriptionTier === 'casual' ? 'default' : 'secondary'} className="uppercase">
                                                {user.subscriptionTier || 'free'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Settings & Usage</CardTitle>
                                <CardDescription>Manage user preferences and limits.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Newsletter Subscription</Label>
                                        <div className="text-sm text-muted-foreground">
                                            Receive daily icebreaker emails.
                                        </div>
                                    </div>
                                    <Switch checked={isSubscribed} onCheckedChange={setIsSubscribed} />
                                </div>

                                <div className="space-y-2 border p-3 rounded-lg">
                                    <div className="flex justify-between items-center mb-2">
                                        <Label className="text-base">AI Usage Count</Label>
                                        {user.aiUsage?.cycleStart && (
                                            <span className="text-xs text-muted-foreground">
                                                Resets: {new Date(user.aiUsage.cycleStart).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            value={aiUsage}
                                            onChange={(e) => setAiUsage(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="font-mono"
                                        />
                                    </div>
                                </div>

                                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Save Changes
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="styles" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Style Preferences</CardTitle>
                            <CardDescription>Styles the user has explicitly preferred or hidden.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <PreferenceGrid items={styles} type="style" loading={!styles} />
                        </CardContent>
                    </Card>
                </TabsContent>

                 <TabsContent value="tones" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Tone Preferences</CardTitle>
                            <CardDescription>Tones the user has explicitly preferred or hidden.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <PreferenceGrid items={tones} type="tone" loading={!tones} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="questions" className="mt-6">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Question History</CardTitle>
                                    <CardDescription>Recent questions the user has interacted with.</CardDescription>
                                </div>
                                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                    Total: {questions?.length || 0}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="flex flex-col md:flex-row gap-3 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search questions..."
                                        className="pl-9"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm("")}
                                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                    >
                                        <option value="all">All Statuses</option>
                                        {questionStatuses.map(status => (
                                            <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                                        ))}
                                    </select>
                                    {(searchTerm || filterStatus !== "all") && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => {
                                                setSearchTerm("")
                                                setFilterStatus("all")
                                            }}
                                            title="Reset Filters"
                                        >
                                            <Filter className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                             {!questions ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground h-8 w-8" /></div>
                            ) : filteredQuestions?.length === 0 ? (
                                <div className="text-muted-foreground text-center py-12 border rounded-lg border-dashed">
                                    <div className="mb-2">No questions found matching your filters.</div>
                                    {(searchTerm || filterStatus !== "all") && (
                                        <Button variant="link" onClick={() => { setSearchTerm(""); setFilterStatus("all"); }}>
                                            Clear all filters
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredQuestions?.map(q => (
                                        <div key={q._id} className="p-4 border rounded-lg space-y-2 hover:bg-muted/30 transition-colors">
                                            <div className="font-medium text-sm leading-relaxed">{q.question?.text || q.question?.customText || "No text content"}</div>
                                            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                                <div className="flex gap-2 items-center">
                                                    <Badge
                                                        variant={
                                                            q.status === 'liked' ? 'default' :
                                                            q.status === 'hidden' ? 'destructive' :
                                                            q.status === 'sent' ? 'secondary' : 'outline'
                                                        }
                                                        className={q.status === 'liked' ? 'bg-pink-500 hover:bg-pink-600' : ''}
                                                    >
                                                        {q.status}
                                                    </Badge>
                                                    {q.seenCount && q.seenCount > 1 && (
                                                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">Seen {q.seenCount}x</span>
                                                    )}
                                                </div>
                                                <span>{new Date(q.updatedAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
