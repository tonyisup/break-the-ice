"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ThumbsUp,
  ThumbsDown,
  Meh,
  Clock,
  MessageSquare,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const SIGNALS = [
  { key: "landedWell" as const, label: "Landed well", icon: ThumbsUp, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/30" },
  { key: "fellFlat" as const, label: "Fell flat", icon: ThumbsDown, color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  { key: "wrongVibe" as const, label: "Wrong vibe", icon: Meh, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/30" },
  { key: "timingOff" as const, label: "Timing off", icon: Clock, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
];

export default function CoachDailyViewPage() {
  const { activeWorkspace } = useWorkspace();
  const orgId = activeWorkspace;

  const coachToday = useQuery(
    api.core.coachFeedback.getCoachTodayAssignment,
    orgId ? { organizationId: orgId } : "skip"
  );

  const feedbackReport = useQuery(
    api.core.coachFeedback.getWeeklyFeedbackReport,
    coachToday?.scheduleId
      ? { scheduleId: coachToday.scheduleId }
      : "skip"
  );

  const submitFeedback = useMutation(api.core.coachFeedback.submitCoachFeedback);

  // Feedback signal state
  const [signals, setSignals] = React.useState<Record<string, boolean>>({
    landedWell: false,
    fellFlat: false,
    wrongVibe: false,
    timingOff: false,
  });
  const [notes, setNotes] = React.useState("");
  const [submittedLocal, setSubmittedLocal] = React.useState(false);

  const todaySqId = coachToday?.scheduledQuestionId;
  const scheduleKey = coachToday?.scheduleId;

  React.useEffect(() => {
    setSubmittedLocal(false);
    setNotes("");
    setSignals({
      landedWell: false,
      fellFlat: false,
      wrongVibe: false,
      timingOff: false,
    });
  }, [todaySqId, scheduleKey]);

  const feedbackAlreadySent =
    coachToday !== undefined &&
    todaySqId != null &&
    coachToday.hasSubmittedFeedback;

  const submitted = submittedLocal || feedbackAlreadySent;

  const toggleSignal = (key: string) => {
    setSignals((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async () => {
    if (!coachToday?.scheduledQuestionId) return;
    try {
      await submitFeedback({
        scheduledQuestionId: coachToday.scheduledQuestionId,
        ...signals,
        notes: notes.trim() || undefined,
      });
      setSubmittedLocal(true);
      toast.success("Feedback submitted");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit feedback");
    }
  };

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CalendarDays className="size-14 opacity-20" />
        <h2 className="text-xl font-semibold">No organization selected</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm">
          Select your organization in Settings to view today's ice-breaker.
        </p>
        <Button asChild variant="outline">
          <Link to="/settings">Go to Settings</Link>
        </Button>
      </div>
    );
  }

  if (coachToday === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const assignment = coachToday.question;

  if (!assignment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <CalendarDays className="size-14 opacity-20" />
        <h2 className="text-xl font-semibold">No question for today</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Your organization hasn't assigned a question for today yet.
          Ask your admin to set up the weekly schedule.
        </p>
      </div>
    );
  }

  /* ── Today's card ── */
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today's Ice-Breaker</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {coachToday.dayOfWeek && <span className="ml-2">· {coachToday.dayOfWeek}</span>}
        </p>
      </div>

      {/* Question display */}
      <Card className={cn(
        "border-2 transition-all",
        submitted ? "border-primary/20 bg-primary/5" : "border-primary/30 shadow-lg shadow-primary/5",
      )}>
        <CardContent className="p-8 space-y-4">
          <AnimatePresence mode="wait">
            {assignment.question.text ? (
              <motion.p
                key="question"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-medium leading-relaxed"
              >
                {assignment.question.text}
              </motion.p>
            ) : (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-muted-foreground italic"
              >
                No question text available
              </motion.p>
            )}
          </AnimatePresence>

          {(assignment.question.style || assignment.question.tone || assignment.question.topic) && (
            <div className="flex flex-wrap gap-2 pt-2">
              {assignment.question.style && (
                <Badge variant="secondary">{assignment.question.style}</Badge>
              )}
              {assignment.question.tone && (
                <Badge variant="secondary">{assignment.question.tone}</Badge>
              )}
              {assignment.question.topic && (
                <Badge variant="secondary">{assignment.question.topic}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feedback section */}
      {!submitted ? (
        <Card>
          <CardContent className="p-6 space-y-5">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="size-4" />
              How did it go?
            </h3>

            {/* Signal buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SIGNALS.map(({ key, label, icon: Icon, color, bg }) => {
                const active = signals[key];
                return (
                  <Button
                    key={key}
                    variant="outline"
                    className={cn(
                      "h-auto py-3 flex flex-col items-center gap-1.5 text-center transition-all",
                      active ? bg : "",
                    )}
                    onClick={() => toggleSignal(key)}
                  >
                    <Icon className={cn("size-5", active ? color : "text-muted-foreground")} />
                    <span className={cn("text-xs", active ? "font-semibold" : "")}>{label}</span>
                  </Button>
                );
              })}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Any context for next week's curation..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px] resize-none"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void handleSubmit()}>
                Submit Feedback
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-400/20 bg-emerald-400/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <ThumbsUp className="size-5 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-400">Thanks for your feedback!</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Your input helps refine next week's suggestions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly feedback summary (admin view) */}
      {feedbackReport && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3">This Week's Feedback</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold">{feedbackReport.summary.totalResponses}</p>
                <p className="text-xs text-muted-foreground">Responses</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {feedbackReport.summary.landedWellPct.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Landed Well</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">
                  {feedbackReport.summary.fellFlatPct.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Fell Flat</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">
                  {feedbackReport.summary.wrongVibePct.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Wrong Vibe</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}