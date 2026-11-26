import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { editorialReasonLabels } from "@convex/lib/questionReviewValidators";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ClaudeVerdict } from "@/admin/components/claude-verdict/claude-verdict";
import { REJECT_REASONS, isTypingTarget, queueKeyAction, type RejectReason } from "../review/queue";
import { modelName, type Experiment, type ModelResult } from "./grid";

const STATUS_LABEL = { pending: "Waiting", live: "Approved", rejected: "Rejected", retired: "Retired" } as const;
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * One cell's questions, model by model, to approve or reject where they were made. Decisions
 * are the review queue's own (reviewPendingQuestions), with its optional reasons and undo,
 * and the keys J/K, A, R and 1–4 work here too.
 */
export function CellPanel({
  open,
  onOpenChange,
  title,
  experiment,
  results,
  reveal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  experiment: Experiment["experiment"];
  results: ModelResult[];
  reveal: boolean;
}) {
  const review = useMutation(api.admin.review.reviewPendingQuestions);
  const undoReview = useMutation(api.admin.pruning.undoReview);
  const retryCall = useMutation(api.admin.generator.retryCall);
  const [reasons, setReasons] = React.useState<RejectReason[]>([]);
  const [focusedId, setFocusedId] = React.useState<Id<"questions"> | null>(null);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  const pending = results.flatMap((result) => result.calls.flatMap((entry) => entry.questions.filter((q) => q.status === "pending").map((q) => q.question)));
  const focused = pending.find((q) => q._id === focusedId) ?? pending[0];

  const decide = React.useCallback(
    async (question: { _id: Id<"questions">; reviewRevision?: number }, decision: "approve" | "reject") => {
      setBusy((current) => new Set(current).add(question._id));
      try {
        const { reviewId } = await review({
          questions: [{ id: question._id, expectedRevision: question.reviewRevision ?? 0 }],
          decision,
          ...(decision === "reject" && reasons.length > 0 ? { reasons } : {}),
        });
        toast.success(decision === "approve" ? "Approved" : "Rejected", {
          action: { label: "Undo", onClick: () => void undoReview({ reviewId }).catch((error) => toast.error(errorMessage(error, "Couldn't undo"))) },
        });
        if (decision === "reject") setReasons([]);
      } catch (error) {
        toast.error(errorMessage(error, "Couldn't save the decision"));
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(question._id);
          return next;
        });
      }
    },
    [review, undoReview, reasons],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = queueKeyAction(event);
      if (!action) return;
      const index = pending.findIndex((q) => q._id === focused?._id);
      if (action.type === "move") {
        const next = pending[Math.min(pending.length - 1, Math.max(0, index + action.by))];
        if (next) setFocusedId(next._id);
      } else if (action.type === "approve" || action.type === "reject") {
        if (focused) void decide(focused, action.type);
      } else if (action.type === "toggleReason") {
        setReasons((current) => (current.includes(action.reason) ? current.filter((r) => r !== action.reason) : [...current, action.reason]));
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, focused, decide]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Approve or reject here, or later in the review queue. J/K moves, A approves, R rejects, 1–4 picks reasons.</SheetDescription>
          <div role="group" aria-label="Why reject (optional)" className="flex flex-wrap items-center gap-1.5 pt-1">
            {REJECT_REASONS.map((reason, index) => {
              const on = reasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReasons((current) => (on ? current.filter((r) => r !== reason) : [...current, reason]))}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-destructive/60 bg-destructive/10 text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <span className="mr-1 text-[10px] opacity-60">{index + 1}</span>
                  {editorialReasonLabels[reason]}
                </button>
              );
            })}
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4">
          {results.map((result) => (
            <section key={result.model} aria-label={modelName(experiment, result.model, reveal)} className="space-y-3">
              <h3 className="text-sm font-semibold">{modelName(experiment, result.model, reveal)}</h3>
              {result.calls.map(({ call, questions }) => (
                <div key={call._id} className="space-y-2">
                  {(call.status === "queued" || call.status === "running") && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {call.status === "queued" ? "Waiting to start" : "Generating"}
                    </p>
                  )}
                  {call.status === "failed" && (
                    <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <p className="min-w-0 break-words">{call.error ?? "The call failed."}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1"
                        onClick={() => void retryCall({ callId: call._id }).catch((error) => toast.error(errorMessage(error, "Couldn't retry")))}
                      >
                        <RotateCw aria-hidden="true" className="size-3.5" /> Retry
                      </Button>
                    </div>
                  )}
                  {call.status === "done" && questions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No new questions: {call.duplicateCount ?? 0} duplicate, {call.rejectedCount ?? 0} didn&rsquo;t pass the checks.
                    </p>
                  )}
                  {questions.map(({ question, status }) => {
                    const isFocused = status === "pending" && question._id === focused?._id;
                    return (
                      <article
                        key={question._id}
                        aria-current={isFocused ? "true" : undefined}
                        onClick={() => status === "pending" && setFocusedId(question._id)}
                        className={cn("space-y-2 rounded-lg border p-3", isFocused && "border-primary shadow-[inset_3px_0_0_hsl(var(--primary))]")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium">{question.text ?? question.customText}</p>
                          <Badge variant={status === "pending" ? "secondary" : "outline"} className="shrink-0">
                            {STATUS_LABEL[status]}
                          </Badge>
                        </div>
                        {question.qualityCheck ? (
                          <ClaudeVerdict check={question.qualityCheck} />
                        ) : (
                          <p className="text-xs text-muted-foreground">Claude hasn&rsquo;t checked this yet.</p>
                        )}
                        {status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="gap-1" disabled={busy.has(question._id)} onClick={() => void decide(question, "reject")}>
                              <X aria-hidden="true" className="size-3.5" /> Reject
                            </Button>
                            <Button size="sm" className="gap-1" disabled={busy.has(question._id)} onClick={() => void decide(question, "approve")}>
                              <Check aria-hidden="true" className="size-3.5" /> Approve
                            </Button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
