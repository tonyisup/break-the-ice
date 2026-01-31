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

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"

export default function AdminDashboard() {
  const stats = useQuery(api.questions.getAdminStats)

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
      color: "text-blue-600",
      bgBase: "bg-blue-500/10",
      link: "/admin/questions"
    },
    {
      title: "Active Users",
      value: stats.users.total,
      description: `${stats.users.casual} Casual Plan Users`,
      icon: Users,
      color: "text-purple-600",
      bgBase: "bg-purple-500/10",
      link: "/admin/users"
    },
    {
      title: "Feedback",
      value: stats.feedback.total,
      description: `${stats.feedback.new} New entries to review`,
      icon: ShieldAlert,
      color: "text-amber-600",
      bgBase: "bg-amber-500/10",
      link: "/admin/feedback"
    },
    {
      title: "Duplicates",
      value: stats.duplicates.pending,
      description: "Potential duplicates detected",
      icon: Copy,
      color: "text-red-600",
      bgBase: "bg-red-500/10",
      link: "/admin/duplicates"
    }
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your ice-breaker ecosystem.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.title} to={card.link} className="block group">
            <Card className="hover:shadow-md hover:border-primary/20 transition-all border-muted/60 rounded-2xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <div className={`p-2 rounded-lg ${card.bgBase} ${card.color}`}>
                    <card.icon className="size-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1 group-hover:text-primary transition-colors flex items-center gap-1">
                    {card.description}
                    <ArrowRight className="size-3 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-2xl border-muted/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="size-5 text-green-600" />
              Quick Actions
            </CardTitle>
            <CardDescription>Perform common administrative maintenance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30 group hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 text-red-600">
                  <Trash2 className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Stale Questions</p>
                  <p className="text-xs text-muted-foreground">{stats.staleCount} questions candidates for pruning</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/prune">Manage <ArrowRight className="size-3 ml-1" /></Link>
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30 group hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Pending Review</p>
                  <p className="text-xs text-muted-foreground">{stats.questions.pending} user-submitted questions</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/questions">Review <ArrowRight className="size-3 ml-1" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-muted/60 shadow-sm bg-primary/5 border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="size-5 text-primary" />
              System Status
            </CardTitle>
            <CardDescription>AIGC and Infrastructure health.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Database Health</span>
              <Badge variant="default" className="bg-green-500 hover:bg-green-500 h-2 w-2 rounded-full p-0" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">AI Generation Engine</span>
              <Badge variant="default" className="bg-green-500 hover:bg-green-500 h-2 w-2 rounded-full p-0" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Global Questions</span>
              <span className="font-mono text-xs">{stats.questions.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pruned Storage</span>
              <span className="font-mono text-xs">{stats.questions.pruned} docs</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
