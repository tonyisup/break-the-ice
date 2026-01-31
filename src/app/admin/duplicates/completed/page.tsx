"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import {
    History,
    ArrowLeft,
    ArrowRight
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router-dom"
import { IconComponent } from "@/components/ui/icons/icon"

export default function DuplicateHistoryPage() {
    const duplicateHistory = useQuery(api.questions.getCompletedDuplicateDetections)

    if (!duplicateHistory) {
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
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground mb-4">
                        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 h-8">
                            <Link to="/admin/duplicates">
                                <ArrowLeft className="size-3.5" />
                                Back to Duplicates
                            </Link>
                        </Button>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight">Review History</h2>
                    <p className="text-muted-foreground">History of completed duplicate detection reviews.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="px-3 py-1 text-sm">{duplicateHistory.length} Total Reviews</Badge>
                </div>
            </div>

            {duplicateHistory.length === 0 ? (
                <div className="py-20 text-center space-y-4 border-2 border-dashed rounded-3xl">
                    <History className="size-12 text-muted-foreground/20 mx-auto" />
                    <div className="space-y-1">
                        <p className="text-lg font-medium">No history found</p>
                        <p className="text-muted-foreground">You haven't reviewed any duplicates yet.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-6">
                    {duplicateHistory.map((detection: any) => (
                        <div key={detection._id} className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Badge className={
                                        detection.status === "approved"
                                            ? "bg-green-500 hover:bg-green-600 text-white"
                                            : "bg-red-500 hover:bg-red-600 text-white"
                                    }>
                                        {detection.status.toUpperCase()}
                                    </Badge>
                                    <span className="text-xs font-medium text-muted-foreground">Reviewed {new Date(detection.reviewedAt || detection._creationTime).toLocaleString()}</span>
                                </div>
                                {detection.rejectReason && (
                                    <Badge variant="outline" className="text-xs opacity-70">
                                        Reason: {detection.rejectReason}
                                    </Badge>
                                )}
                            </div>

                            <div className="p-6">
                                <div className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-6">
                                    {/* Show the questions involved */}
                                    {detection.questions.slice(0, 2).map((q: any, idx: number) => (
                                        <React.Fragment key={q._id}>
                                            <div className="p-4 rounded-xl bg-muted/20 border space-y-3 relative overflow-hidden">
                                                <p className="text-sm leading-relaxed relative z-10">{q.text}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                                    {q.style && (
                                                        <Badge variant="outline" className="flex items-center gap-1 bg-background/50">
                                                            <IconComponent icon={q.style.icon} color={q.style.color} />
                                                            {q.style.name}
                                                        </Badge>
                                                    )}
                                                    {q.tone && (
                                                        <Badge variant="outline" className="flex items-center gap-1 bg-background/50">
                                                            <IconComponent icon={q.tone.icon} color={q.tone.color} />
                                                            {q.tone.name}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {idx === 0 && (
                                                <div className="flex justify-center text-muted-foreground/30">
                                                    <ArrowRight className="size-6 hidden md:block" />
                                                    <div className="h-px w-full bg-border md:hidden my-2" />
                                                </div>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {detection.questions.length > 2 && (
                                        <div className="md:col-start-3 flex justify-center md:justify-start -mt-4">
                                            <Badge variant="secondary" className="text-[10px] opacity-70 px-2 py-0 h-5">
                                                +{detection.questions.length - 2} more
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
