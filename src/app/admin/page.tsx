"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import {
  MessageSquare,
  Users,
  ShieldAlert,
  Copy,
  Trash2,
  TrendingUp,
  ArrowRight
} from "lucide-react"

import { Link } from "react-router-dom"

export default function AdminDashboard() {
  const stats = useQuery(api.admin.questions.getAdminStats)

  if (!stats) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl" />)}
      </div>
    )
  }

  const statCards = [
    {
      title: "Total Questions",
      value: stats.questions.total,
      description: `${stats.questions.public} Public, ${stats.questions.pending} Pending`,
      icon: MessageSquare,
      link: "/admin/questions"
    },
    {
      title: "Team Workspaces",
      value: stats.organizations.team,
      description: `${stats.users.total} Active Users`,
      icon: Users,
      link: "/admin/users"
    },
    {
      title: "Feedback",
      value: stats.feedback.total,
      description: `${stats.feedback.new} New entries to review`,
      icon: ShieldAlert,
      link: "/admin/feedback"
    },
    {
      title: "Duplicates",
      value: stats.duplicates.pending,
      description: "Potential duplicates detected",
      icon: Copy,
      link: "/admin/duplicates"
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">The current state of questions, workspaces, and moderation.</p>
      </div>

      <section aria-labelledby="key-metrics" className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <h2 id="key-metrics" className="sr-only">Key metrics</h2>
        {statCards.map((card) => (
          <Link
            key={card.title}
            to={card.link}
            className="group bg-card p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
              <card.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
            </div>
            <div className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">{card.value}</div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {card.description}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <section aria-labelledby="quick-actions" className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 id="quick-actions" className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              Needs attention
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Review the queues that can change today.</p>
          </div>
          <div className="divide-y">
            <Link to="/admin/prune" className="group flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-destructive">
                  <Trash2 className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Stale Questions</p>
                  <p className="text-sm text-muted-foreground">{stats.staleCount} candidates for pruning</p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm font-medium">Review <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </Link>

            <Link to="/admin/questions" className="group flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                  <MessageSquare className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Pending Review</p>
                  <p className="text-sm text-muted-foreground">{stats.questions.pending} user-submitted questions</p>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm font-medium">Review <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
            </Link>
          </div>
        </section>

        <section aria-labelledby="system-status" className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 id="system-status" className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
              System Status
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Generation and storage health.</p>
          </div>
          <div className="divide-y px-5">
            <div className="flex min-h-12 items-center justify-between gap-4 text-sm">
              <span>Database</span>
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />Operational</span>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 text-sm">
              <span>AI Generation</span>
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />Operational</span>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 text-sm">
              <span>Global Questions</span>
              <span className="font-mono text-xs tabular-nums">{stats.questions.total}</span>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-4 text-sm">
              <span>Pruned Storage</span>
              <span className="font-mono text-xs tabular-nums">{stats.questions.pruned} docs</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
