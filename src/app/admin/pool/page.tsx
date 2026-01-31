"use client"

import * as React from "react"
import { useQuery, useAction, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"
import {
    Calendar,
    RefreshCw,
    Send,
    CheckCircle,
    Clock,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IconComponent, Icon } from "@/components/ui/icons/icon"
import { iconMap } from "@/components/ui/icons/icons"
import { toast } from "sonner"

type PoolStats = {
    totalQuestions: number
    availableQuestions: number
    distributedQuestions: number
    byStyleTone: Array<{
        style: string
        styleName: string
        tone: string
        toneName: string
        count: number
    }>
}

type PoolQuestion = {
    _id: string
    _creationTime: number
    text?: string
    poolStatus?: "available" | "distributed"
    style?: {
        _id: string
        name: string
        icon: string
        color: string
    }
    tone?: {
        _id: string
        name: string
        icon: string
        color: string
    }
}

export default function PoolPage() {
    const [selectedDate, setSelectedDate] = React.useState(() => {
        return new Date().toISOString().split('T')[0]
    })
    const [statusFilter, setStatusFilter] = React.useState<"all" | "available" | "distributed">("all")
    const [isGenerating, setIsGenerating] = React.useState(false)
    const [isAssigning, setIsAssigning] = React.useState(false)

    const stats = useQuery(api.questions.getPoolStats, { poolDate: selectedDate }) as PoolStats | undefined
    const questions = useQuery(api.questions.getPoolQuestions, {
        poolDate: selectedDate,
        status: statusFilter,
        limit: 100,
    }) as PoolQuestion[] | undefined

    const triggerGeneration = useAction(api.questions.triggerPoolGeneration)
    const triggerAssignment = useAction(api.questions.triggerPoolAssignment)
    const deleteQuestion = useMutation(api.questions.deleteQuestion)

    const getSafeIcon = (iconName: string): Icon => {
        return (iconName in iconMap ? iconName : "HelpCircle") as Icon
    }

    const navigateDate = (direction: "prev" | "next") => {
        const [year, month, day] = selectedDate.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        date.setDate(date.getDate() + (direction === "next" ? 1 : -1))

        const newYear = date.getFullYear()
        const newMonth = String(date.getMonth() + 1).padStart(2, '0')
        const newDay = String(date.getDate()).padStart(2, '0')

        setSelectedDate(`${newYear}-${newMonth}-${newDay}`)
    }

    const handleGenerate = async () => {
        setIsGenerating(true)
        try {
            const result = await triggerGeneration({})
            toast.success(`Generated ${result.questionsGenerated} questions across ${result.combinationsProcessed} style/tone combinations`)
            if (result.errors.length > 0) {
                toast.warning(`${result.errors.length} errors occurred during generation`)
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error"
            toast.error(`Generation failed: ${message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleAssign = async () => {
        setIsAssigning(true)
        try {
            const result = await triggerAssignment({})
            toast.success(`Assigned ${result.totalAssigned} questions to ${result.usersProcessed} users`)
            if (result.errors.length > 0) {
                toast.warning(`${result.errors.length} errors occurred during assignment`)
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error"
            toast.error(`Assignment failed: ${message}`)
        } finally {
            setIsAssigning(false)
        }
    }

    const handleDelete = async (id: Id<"questions">) => {
        try {
            await deleteQuestion({ id })
            toast.success("Question removed from pool")
        } catch (error) {
            toast.error("Failed to remove question")
        }
    }

    const isToday = selectedDate === new Date().toISOString().split('T')[0]
    const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Question Pool</h2>
                    <p className="text-muted-foreground">Manage nightly AI-generated questions for user distribution.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleGenerate}
                        disabled={!isToday || isGenerating}
                        variant="outline"
                        className="gap-2"
                    >
                        {isGenerating ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <RefreshCw className="size-4" />
                        )}
                        Generate Pool
                    </Button>
                    <Button
                        onClick={handleAssign}
                        disabled={!isToday || isAssigning || (stats?.availableQuestions ?? 0) === 0}
                        className="gap-2"
                    >
                        {isAssigning ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Send className="size-4" />
                        )}
                        Assign to Users
                    </Button>
                </div>
            </div>

            {/* Date Navigator */}
            <div className="flex items-center justify-center gap-4 py-4">
                <Button variant="ghost" size="icon" onClick={() => navigateDate("prev")}>
                    <ChevronLeft className="size-5" />
                </Button>
                <div className="flex items-center gap-3 min-w-[280px] justify-center">
                    <Calendar className="size-5 text-muted-foreground" />
                    <span className="text-lg font-medium">{formattedDate}</span>
                    {isToday && <Badge variant="secondary">Today</Badge>}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigateDate("next")}
                    disabled={isToday}
                >
                    <ChevronRight className="size-5" />
                </Button>
            </div>

            {/* Stats Cards */}
            {stats ? (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="rounded-2xl border-muted/60">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-muted-foreground">Total Questions</p>
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                                    <Calendar className="size-4" />
                                </div>
                            </div>
                            <p className="text-3xl font-bold mt-2">{stats.totalQuestions}</p>
                            <p className="text-xs text-muted-foreground mt-1">Generated for this date</p>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-muted/60">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-muted-foreground">Available</p>
                                <div className="p-2 rounded-lg bg-green-500/10 text-green-600">
                                    <Clock className="size-4" />
                                </div>
                            </div>
                            <p className="text-3xl font-bold mt-2">{stats.availableQuestions}</p>
                            <p className="text-xs text-muted-foreground mt-1">Ready for assignment</p>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-muted/60">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-muted-foreground">Distributed</p>
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                                    <CheckCircle className="size-4" />
                                </div>
                            </div>
                            <p className="text-3xl font-bold mt-2">{stats.distributedQuestions}</p>
                            <p className="text-xs text-muted-foreground mt-1">Sent to users</p>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-3 animate-pulse">
                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-2xl" />)}
                </div>
            )}

            {/* Style/Tone Breakdown */}
            {stats && stats.byStyleTone.length > 0 && (
                <Card className="rounded-2xl border-muted/60">
                    <CardHeader>
                        <CardTitle className="text-lg">Distribution by Style & Tone</CardTitle>
                        <CardDescription>Breakdown of questions by their style and tone combinations</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {stats.byStyleTone.map((item) => (
                                <div
                                    key={`${item.style}-${item.tone}`}
                                    className="flex items-center justify-between p-3 rounded-xl border bg-muted/30"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{item.styleName}</span>
                                        <span className="text-muted-foreground">×</span>
                                        <span className="text-sm">{item.toneName}</span>
                                    </div>
                                    <Badge variant="secondary">{item.count}</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Questions Table */}
            <Card className="rounded-2xl border-muted/60">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Pool Questions</CardTitle>
                            <CardDescription>Questions generated for {formattedDate}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/50">
                            <Button
                                variant={statusFilter === "all" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 px-3"
                                onClick={() => setStatusFilter("all")}
                            >
                                All
                            </Button>
                            <Button
                                variant={statusFilter === "available" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 px-3"
                                onClick={() => setStatusFilter("available")}
                            >
                                Available
                            </Button>
                            <Button
                                variant={statusFilter === "distributed" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 px-3"
                                onClick={() => setStatusFilter("distributed")}
                            >
                                Distributed
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {questions === undefined ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="size-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">No questions in pool</p>
                            <p className="text-sm">Generate questions using the button above</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {questions.map((question) => (
                                <div
                                    key={question._id}
                                    className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-relaxed">
                                            {question.text || <span className="italic text-muted-foreground">No text</span>}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {question.style && (
                                                <Badge
                                                    variant="outline"
                                                    className="gap-1.5 text-xs"
                                                    style={{ borderColor: question.style.color + '40', color: question.style.color }}
                                                >
                                                    <IconComponent icon={getSafeIcon(question.style.icon)} size={12} />
                                                    {question.style.name}
                                                </Badge>
                                            )}
                                            {question.tone && (
                                                <Badge
                                                    variant="outline"
                                                    className="gap-1.5 text-xs"
                                                    style={{ borderColor: question.tone.color + '40', color: question.tone.color }}
                                                >
                                                    <IconComponent icon={getSafeIcon(question.tone.icon)} size={12} />
                                                    {question.tone.name}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <Badge
                                            variant={question.poolStatus === "distributed" ? "default" : "secondary"}
                                            className={question.poolStatus === "distributed" ? "bg-purple-500 hover:bg-purple-500" : ""}
                                        >
                                            {question.poolStatus === "distributed" ? "Distributed" : "Available"}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(question._id as Id<"questions">)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
