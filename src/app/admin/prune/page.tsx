"use client"

import * as React from "react"
import { useQuery, useAction, useMutation } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { Doc, Id } from "../../../../convex/_generated/dataModel"
import {
	Trash2,
	CheckCircle2,
	AlertCircle,
	Clock,
	ThumbsUp,
	X,
	Search,
	Filter,
	BarChart3,
	Calendar,
	Zap
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

export default function PruningPage() {

	return (
		<div className="space-y-8">
			Pending revamp
		</div>
	)
}
