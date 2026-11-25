import * as React from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PENDING_QUEUE_LIMIT } from "@convex/constants";
import { editorialReasonLabels } from "@convex/lib/questionReviewValidators";
import { Check, ChevronRight, CircleAlert, ExternalLink, Keyboard, Loader2, Sparkles, UserCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ClaudeVerdict } from "@/admin/components/claude-verdict/claude-verdict";
import { Segmented } from "@/admin/components/Segmented";
import {
  QUEUE_SHORTCUTS,
  REJECT_REASONS,
  claudeConcern,
  decisionTarget,
  isTypingTarget,
  matchesFilters,
  nextFocus,
  queueKeyAction,
  reviewBatches,
  shownText,
  type ClaudeFilter,
  type RejectReason,
  type ReviewQuestion,
  type SourceFilter,
} from "./queue";

type Decision = "approve" | "reject";
type RemixProposal = { id: Id<"questions">; text: string; revision: number };

const CLAUDE_FILTERS: { value: ClaudeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "keep", label: "Claude: keep" },
  { value: "hold", label: "Claude: concern" },
  { value: "unchecked", label: "Not checked" },
];
const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "ai", label: "AI" },
  { value: "people", label: "People" },
];

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function ReviewQueuePage() {
  const pendingQueue = useQuery(api.admin.questions.getPendingQuestions);
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const reviewQuestions = useMutation(api.admin.review.reviewPendingQuestions);
  const updateQuestion = useMutation(api.admin.questions.updateQuestion);
  const undoReview = useMutation(api.admin.pruning.undoReview);
  const remixQuestion = useAction(api.admin.questions.remixQuestion);

  const [claudeFilter, setClaudeFilter] = React.useState<ClaudeFilter>("all");
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>("all");
  const [selected, setSelected] = React.useState<Set<Id<"questions">>>(new Set());
  const [focusedId, setFocusedId] = React.useState<Id<"questions"> | null>(null);
  const [reasons, setReasons] = React.useState<Set<RejectReason>>(new Set());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [remixingId, setRemixingId] = React.useState<Id<"questions"> | null>(null);
  const [remix, setRemix] = React.useState<RemixProposal | null>(null);

  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const noteRef = React.useRef<HTMLInputElement>(null);
  const rowRefs = React.useRef(new Map<Id<"questions">, HTMLLIElement>());

  // The query returns one extra question when more are waiting than the queue shows.
  const pending = React.useMemo(() => (pendingQueue ?? []).slice(0, PENDING_QUEUE_LIMIT), [pendingQueue]);
  const morePending = (pendingQueue?.length ?? 0) > PENDING_QUEUE_LIMIT;
  const visible = React.useMemo(
    () => pending.filter((q) => matchesFilters(q, claudeFilter, sourceFilter)),
    [pending, claudeFilter, sourceFilter],
  );

  // Keep focus on a real question as the live list changes: decided questions leave it, and
  // the one that took their place gets focus.
  const previousVisible = React.useRef<ReviewQuestion[]>([]);
  React.useEffect(() => {
    setFocusedId((current) => nextFocus(previousVisible.current, visible, current));
    previousVisible.current = visible;
    setSelected((current) => {
      const ids = new Set(pending.map((q) => q._id));
      const kept = [...current].filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [visible, pending]);

  React.useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.scrollIntoView?.({ block: "nearest" });
  }, [focusedId]);

  const focused = visible.find((q) => q._id === focusedId) ?? null;
  const target = decisionTarget(visible, selected, focusedId);
  const allVisibleSelected = visible.length > 0 && visible.every((q) => selected.has(q._id));

  const toggleSelected = React.useCallback((id: Id<"questions">) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleReason = React.useCallback((reason: RejectReason) => {
    setReasons((current) => {
      const next = new Set(current);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  }, []);

  const undoAll = React.useCallback(
    async (reviewIds: Id<"questionReviews">[]) => {
      try {
        for (const reviewId of [...reviewIds].reverse()) await undoReview({ reviewId });
        toast.success("Undone. The questions are back in the queue.");
      } catch (error) {
        toast.error(errorMessage(error, "Could not undo"));
      }
    },
    [undoReview],
  );

  const decide = React.useCallback(
    async (decision: Decision) => {
      if (busy || target.length === 0) return;
      setBusy(true);
      const reviewIds: Id<"questionReviews">[] = [];
      let decided = 0;
      try {
        for (const batch of reviewBatches(target)) {
          const { reviewId } = await reviewQuestions({
            questions: batch.map((q) => ({ id: q._id, expectedRevision: q.reviewRevision ?? 0 })),
            decision,
            ...(decision === "reject" && reasons.size > 0 ? { reasons: [...reasons] } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          });
          reviewIds.push(reviewId);
          decided += batch.length;
        }
        const noun = decided === 1 ? "1 question" : `${decided} questions`;
        toast.success(`${decision === "approve" ? "Approved" : "Rejected"} ${noun}`, {
          action: { label: "Undo", onClick: () => void undoAll(reviewIds) },
        });
        setSelected(new Set());
        setReasons(new Set());
        setNote("");
      } catch (error) {
        const saved = decided > 0 ? ` ${decided} of ${target.length} were saved first.` : "";
        toast.error(`${errorMessage(error, "Could not save the review")}${saved}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, target, reviewQuestions, reasons, note, undoAll],
  );

  const move = React.useCallback(
    (by: 1 | -1) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((q) => q._id === focusedId);
      const next = Math.min(visible.length - 1, Math.max(0, index + by));
      setFocusedId(visible[next]._id);
    },
    [visible, focusedId],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (helpOpen || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) {
        if (event.key === "Escape") (event.target as HTMLElement).blur();
        return;
      }
      const action = queueKeyAction(event);
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case "move":
          return move(action.by);
        case "toggleSelect":
          if (focusedId) toggleSelected(focusedId);
          return;
        case "selectAll":
          return setSelected(new Set(visible.map((q) => q._id)));
        case "clear":
          return setSelected(new Set());
        case "approve":
          return void decide("approve");
        case "reject":
          return void decide("reject");
        case "toggleReason":
          return toggleReason(action.reason);
        case "editText":
          return textRef.current?.focus();
        case "editNote":
          return noteRef.current?.focus();
        case "help":
          return setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, move, focusedId, toggleSelected, visible, decide, toggleReason]);

  const saveText = async (question: ReviewQuestion, text: string, revision: number) => {
    if (!text.trim() || text === shownText(question)) return;
    try {
      await updateQuestion({ id: question._id, text, expectedRevision: revision, reviewReason: "Edited during review" });
      toast.success("Wording saved");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save the wording"));
    }
  };

  const saveTaxonomy = async (question: ReviewQuestion, field: "style" | "tone", value: string) => {
    try {
      await updateQuestion({ id: question._id, [field]: value });
    } catch (error) {
      toast.error(errorMessage(error, `Could not change the ${field}`));
    }
  };

  const startRemix = async (question: ReviewQuestion) => {
    setRemixingId(question._id);
    try {
      const text = await remixQuestion({ id: question._id });
      setRemix({ id: question._id, text, revision: question.reviewRevision ?? 0 });
    } catch (error) {
      toast.error(`Remix failed: ${errorMessage(error, "unknown error")}`);
    } finally {
      setRemixingId(null);
    }
  };

  const applyRemix = async (proposal: RemixProposal) => {
    try {
      await updateQuestion({
        id: proposal.id,
        text: proposal.text,
        expectedRevision: proposal.revision,
        reviewReason: "Remixed during review",
        reviewOutcome: "remix",
      });
      setRemix(null);
      toast.success("Remix applied");
    } catch (error) {
      toast.error(errorMessage(error, "Could not apply the remix"));
    }
  };

  if (pendingQueue === undefined || styles === undefined || tones === undefined) {
    return (
      <div className="flex h-[50vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading the review queue</span>
      </div>
    );
  }

  const styleName = (slug?: string) => styles.find((s) => s.id === slug)?.name ?? slug ?? "No style";
  const toneName = (slug?: string) => tones.find((t) => t.id === slug)?.name ?? slug ?? "No tone";
  const onlyPeople = target.length > 0 && target.every((q) => !q.isAIGenerated);

  return (
    // The page fills the window below the admin header (h-16) and main's padding, so the list
    // and the focused question scroll inside it and the decision bar stays on screen. A sticky
    // bar can't do this: main's overflow makes it the sticky container, and main never scrolls.
    <div className="flex h-[calc(100dvh-6rem)] min-h-[32rem] flex-col gap-4 sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Review queue
            <Badge variant="secondary" className="rounded-full">
              {pending.length}
              {morePending ? "+" : ""}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Oldest first. Approve makes a question public; reject hides an AI question and keeps a person&rsquo;s private.
            {morePending && ` Showing the oldest ${PENDING_QUEUE_LIMIT}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Claude's verdict" value={claudeFilter} options={CLAUDE_FILTERS} onChange={setClaudeFilter} />
          <Segmented label="Written by" value={sourceFilter} options={SOURCE_FILTERS} onChange={setSourceFilter} />
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setHelpOpen(true)}>
            <Keyboard className="size-4" />
            <span className="max-sm:sr-only">Shortcuts</span>
          </Button>
        </div>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-semibold">Nothing waiting for review.</p>
          <p className="text-sm text-muted-foreground">New questions land here as they are generated or submitted.</p>
        </div>
      ) : (
        // Each pane scrolls on its own. Below lg only the list shows, and each row links to its details.
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <section aria-label="Pending questions" className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
            <div className="flex shrink-0 items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Checkbox
                aria-label="Select all shown"
                checked={allVisibleSelected}
                onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((q) => q._id)))}
              />
              <span>
                {selected.size > 0 ? `${selected.size} selected` : `${visible.length} shown`}
              </span>
            </div>
            {visible.length === 0 ? (
              <div className="p-6 text-center text-sm">
                <p>No questions match these filters.</p>
                <Button variant="link" size="sm" onClick={() => { setClaudeFilter("all"); setSourceFilter("all"); }}>
                  Show all
                </Button>
              </div>
            ) : (
              <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
                {visible.map((q) => {
                  const isFocused = q._id === focusedId;
                  return (
                    <li
                      key={q._id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(q._id, node);
                        else rowRefs.current.delete(q._id);
                      }}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 transition-colors",
                        isFocused ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : "hover:bg-muted/50",
                        selected.has(q._id) && !isFocused && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        aria-label={`Select: ${shownText(q)}`}
                        checked={selected.has(q._id)}
                        onChange={() => toggleSelected(q._id)}
                      />
                      <button
                        type="button"
                        aria-current={isFocused ? "true" : undefined}
                        onClick={() => setFocusedId(q._id)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none"
                      >
                        {/* Below lg there's no focused pane, so the focused row shows its full wording. */}
                        <span className={cn("line-clamp-2 text-sm font-medium", isFocused && "max-lg:line-clamp-none")}>{shownText(q)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {q.isAIGenerated ? <Sparkles aria-label="AI generated" className="size-3" /> : <UserCircle aria-label="Written by a person" className="size-3" />}
                          <span>{styleName(q.style)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{toneName(q.tone)}</span>
                          {claudeConcern(q) && (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                              <CircleAlert aria-hidden="true" className="size-3" />
                              Claude concern
                            </span>
                          )}
                          {q.qualityCheck?.wouldPublish && (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                              <Check aria-hidden="true" className="size-3" />
                              Would publish
                            </span>
                          )}
                        </span>
                      </button>
                      <Link
                        to={`/admin/questions/${q._id}`}
                        aria-label={`Details: ${shownText(q)}`}
                        className="-my-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                      >
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* The focused question, to read closely, fix and remix. Wide screens only. */}
          <section aria-label="Focused question" className="hidden min-h-0 overflow-y-auto lg:block">
            {focused ? (
              <div className="space-y-4 rounded-xl border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {focused.isAIGenerated ? <Sparkles className="size-3" /> : <UserCircle className="size-3" />}
                    {focused.isAIGenerated ? "AI generated" : "Written by a person"}
                  </span>
                  <Link to={`/admin/questions/${focused._id}`} className="inline-flex items-center gap-1 normal-case tracking-normal hover:text-foreground">
                    Details <ExternalLink className="size-3" />
                  </Link>
                </div>
                <textarea
                  // A new revision remounts the box with the current wording, and the save carries
                  // the revision the edit started from, so stale text is refused.
                  key={`${focused._id}:${focused.reviewRevision ?? 0}`}
                  ref={textRef}
                  aria-label="Question wording"
                  className="min-h-[96px] w-full resize-y rounded-md border bg-background p-3 text-lg font-medium outline-none focus:ring-2 focus:ring-primary/20"
                  defaultValue={shownText(focused)}
                  onFocus={(e) => {
                    e.currentTarget.dataset.editRevision = String(focused.reviewRevision ?? 0);
                  }}
                  onBlur={(e) => void saveText(focused, e.currentTarget.value, Number(e.currentTarget.dataset.editRevision ?? focused.reviewRevision ?? 0))}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Style
                    <select
                      value={focused.style ?? ""}
                      onChange={(e) => void saveTaxonomy(focused, "style", e.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm font-normal normal-case tracking-normal text-foreground"
                    >
                      <option value="">Select style…</option>
                      {styles.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tone
                    <select
                      value={focused.tone ?? ""}
                      onChange={(e) => void saveTaxonomy(focused, "tone", e.target.value)}
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm font-normal normal-case tracking-normal text-foreground"
                    >
                      <option value="">Select tone…</option>
                      {tones.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {focused.qualityCheck ? (
                  <ClaudeVerdict check={focused.qualityCheck} />
                ) : (
                  <p className="text-sm text-muted-foreground">Claude hasn&rsquo;t checked this question.</p>
                )}
                {remix?.id === focused._id ? (
                  <div className="space-y-3 rounded-md border border-blue-500/40 bg-blue-500/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Remix</p>
                    <p className="font-medium">{remix.text}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void applyRemix(remix)}>Use this wording</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemix(null)}>Discard</Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={remixingId !== null}
                    onClick={() => void startRemix(focused)}
                  >
                    {remixingId === focused._id ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Remix
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Pick a question to review it.
              </div>
            )}
          </section>
        </div>
      )}

      {pending.length > 0 && (
        // One place to decide, for the focused question or the whole selection.
        <div className="shrink-0">
          <div
            role="region"
            aria-label="Decision"
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur lg:flex-row lg:items-center",
              selected.size > 0 && "border-primary/50",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium lg:w-44 lg:shrink-0">
              {selected.size > 0 ? (
                <>
                  <span>{target.length} selected</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">{focused ? "This question" : "Nothing in focus"}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div role="group" aria-label="Why reject (optional)" className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Why reject? Optional:</span>
                {REJECT_REASONS.map((reason, index) => (
                  <button
                    key={reason}
                    type="button"
                    aria-pressed={reasons.has(reason)}
                    onClick={() => toggleReason(reason)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors max-md:py-1.5",
                      reasons.has(reason) ? "border-destructive/60 bg-destructive/10 text-destructive" : "hover:bg-muted",
                    )}
                  >
                    <kbd className="mr-1 font-mono text-[10px] text-muted-foreground">{index + 1}</kbd>
                    {editorialReasonLabels[reason]}
                  </button>
                ))}
              </div>
              <Input
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                aria-label="Note (optional)"
                className="h-9"
              />
            </div>
            <div className="flex gap-2 lg:shrink-0">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive lg:flex-none"
                disabled={busy || target.length === 0}
                onClick={() => void decide("reject")}
                title={onlyPeople ? "Keeps the question private to its author" : "Hides an AI question from everyone; a person's question stays private to them"}
              >
                <X className="size-4" />
                {onlyPeople ? "Keep private" : "Reject"}
                <kbd className="font-mono text-[10px] opacity-60">R</kbd>
              </Button>
              <Button
                className="flex-1 gap-2 bg-green-600 text-white hover:bg-green-700 lg:flex-none"
                disabled={busy || target.length === 0}
                onClick={() => void decide("approve")}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve{target.length > 1 ? ` ${target.length}` : ""}
                <kbd className="font-mono text-[10px] opacity-60">A</kbd>
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Approve and reject act on the selection, or on the focused question when nothing is selected.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {QUEUE_SHORTCUTS.map((shortcut) => (
              <React.Fragment key={shortcut.keys}>
                <dt><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{shortcut.keys}</kbd></dt>
                <dd>{shortcut.label}</dd>
              </React.Fragment>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
