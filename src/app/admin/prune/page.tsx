"use client";

import { useEffect, useId, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { editorialReasonLabels } from "../../../../convex/lib/questionReviewValidators";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { QuestionReviewHistory } from "@/components/admin/QuestionReviewHistory";
import { toast } from "sonner";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not save review";
type EditorialReason = keyof typeof editorialReasonLabels;
type Target = Doc<"pruning"> & { question: Doc<"questions"> };

function EditorialFlagForm() {
  const flag = useMutation(api.admin.pruning.flagQuestion);
  const [questionId, setQuestionId] = useState("");
  const [reasons, setReasons] = useState<EditorialReason[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Flag a question for editorial review
      </summary>
      <form
        className="mt-4 space-y-4 max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void flag({
            questionId: questionId.trim() as Id<"questions">,
            reasons,
            notes,
          })
            .then(() => {
              toast.success("Question added to review");
              setQuestionId("");
              setReasons([]);
              setNotes("");
            })
            .catch((error: unknown) => toast.error(message(error)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={`${id}-question`}>Question ID</Label>
          <Input
            id={`${id}-question`}
            value={questionId}
            onChange={(event) => setQuestionId(event.target.value)}
            required
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Paste the ID from the question’s admin URL. Questions can be flagged
            before they have any views.
          </p>
        </div>
        <fieldset disabled={busy} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Editorial reasons
          </legend>
          {Object.entries(editorialReasonLabels).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reasons.includes(value as EditorialReason)}
                onChange={(event) =>
                  setReasons((current) =>
                    event.target.checked
                      ? [...current, value as EditorialReason]
                      : current.filter((reason) => reason !== value),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor={`${id}-notes`}>What needs a closer look?</Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            required
            disabled={busy}
          />
        </div>
        <Button
          disabled={
            busy || !reasons.length || !notes.trim() || !questionId.trim()
          }
        >
          {busy ? "Flagging…" : "Add to review"}
        </Button>
      </form>
    </details>
  );
}

function ReviewCard({ target }: { target: Target }) {
  const approve = useMutation(api.admin.pruning.approvePruning);
  const keep = useMutation(api.admin.pruning.rejectPruning);
  const update = useMutation(api.admin.questions.updateQuestion);
  const remix = useAction(api.admin.questions.remixQuestion);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    text: string;
    revision: number;
    outcome: "edit" | "remix";
  } | null>(null);
  const id = useId();
  const revision = target.question.reviewRevision ?? 0;
  const text = target.question.text ?? target.question.customText ?? "";
  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(success);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col rounded-xl">
      <CardHeader className="space-y-4">
        <Badge variant="secondary" className="self-start">
          Needs review
        </Badge>
        <p className="text-lg font-medium leading-relaxed">"{text}"</p>
        {draft ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <Label htmlFor={`${id}-draft`}>
              {draft.outcome === "remix"
                ? "Remix draft — not saved"
                : "Edit draft — not saved"}
            </Label>
            <Textarea
              id={`${id}-draft`}
              value={draft.text}
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...draft, text: event.target.value })
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                aria-label="Save"
                size="sm"
                disabled={busy || !draft.text.trim() || !reason.trim()}
                onClick={() => {
                  void run(async () => {
                    await update({
                      id: target.questionId,
                      text: draft.text,
                      expectedRevision: draft.revision,
                      reviewReason: reason,
                      reviewSource: "pruning",
                      reviewOutcome: draft.outcome,
                    });
                    setDraft(null);
                  }, "Draft saved. Review the question before keeping or pruning it.");
                }}
              >
                Save draft
              </Button>
              <Button
                aria-label="Cancel"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Discard draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              aria-label="Edit"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setDraft({ text, revision, outcome: "edit" })}
            >
              Edit
            </Button>
            <Button
              aria-label="Remix"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const newText = await remix({ id: target.questionId });
                  setDraft({ text: newText, revision, outcome: "remix" });
                }, "Remix draft ready for review");
              }}
            >
              {busy ? "Working…" : "Remix"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 flex-1">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Review signals</p>
          <p className="text-sm text-muted-foreground">{target.reason}</p>
          {target.editorialReasons?.map((reason) => (
            <Badge key={reason} variant="outline" className="mr-1">
              {editorialReasonLabels[reason]}
            </Badge>
          ))}
          {target.editorialNotes && (
            <p className="text-sm">{target.editorialNotes}</p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Views</dt>
            <dd>{target.metrics?.totalShows ?? target.question.totalShows}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Likes</dt>
            <dd>{target.metrics?.totalLikes ?? target.question.totalLikes}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avg. view</dt>
            <dd>
              {(
                (target.metrics?.averageViewDuration ??
                  target.question.averageViewDuration) / 1000
              ).toFixed(1)}
              s
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Hidden</dt>
            <dd>{target.metrics?.hiddenCount ?? "Not measured"}</dd>
          </div>
        </dl>
        <div className="space-y-2">
          <Label htmlFor={`${id}-reason`}>Review reason</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder="Explain your editorial decision before saving, keeping, or pruning."
          />
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={busy || draft !== null || !reason.trim()}
          onClick={() => {
            void run(
              () =>
                keep({
                  pruningId: target._id,
                  reason,
                  expectedRevision: revision,
                }),
              "Question kept",
            );
          }}
        >
          Keep
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={busy || draft !== null || !reason.trim()}
          onClick={() => {
            void run(
              () =>
                approve({
                  pruningId: target._id,
                  reason,
                  expectedRevision: revision,
                }),
              "Question pruned",
            );
          }}
        >
          Prune
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function PruningPage() {
  const pending = useQuery(api.admin.pruning.getPendingTargets, { limit: 10 });
  const gather = useAction(api.admin.pruning.triggerGathering);
  const [gathering, setGathering] = useState(false);
  const [batchIds, setBatchIds] = useState<Id<"pruning">[] | null>(null);
  useEffect(() => {
    if (pending)
      setBatchIds((current) => current ?? pending.map((target) => target._id));
  }, [pending]);
  const batch =
    pending?.filter((target) => batchIds?.includes(target._id)) ?? [];
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Pruning Workshop
          </h1>
          <p className="mt-2 text-muted-foreground">
            Review wording, answerability, and fit. Low engagement is a signal
            to inspect, not proof of poor content.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/prune/settings">Settings</Link>
          </Button>
          <Button
            variant="outline"
            disabled={gathering}
            onClick={() => {
              setGathering(true);
              void gather({})
                .then((result) =>
                  toast.success(`Found ${result.targetsFound} candidates`),
                )
                .catch((error: unknown) => toast.error(message(error)))
                .finally(() => setGathering(false));
            }}
          >
            {gathering ? "Finding…" : "Find review candidates"}
          </Button>
        </div>
      </div>
      <EditorialFlagForm />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">Small review batch</h2>
          <p className="text-sm text-muted-foreground">
            Up to 10 questions at a time. Check the saved outcomes below before
            starting another batch.
          </p>
        </div>
        <Badge variant="outline">{batch.length} remaining</Badge>
      </div>
      {pending === undefined ? (
        <p role="status">Loading review queue…</p>
      ) : batch.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batch.map((target) => (
            <ReviewCard key={target._id} target={target} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
          <h3 className="font-semibold">
            {pending.length
              ? "This batch is complete"
              : "No pending review items"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {pending.length
              ? "Check recent decisions and undo anything that needs another look."
              : "You can manually flag a question or gather more review signals."}
          </p>
          {pending.length > 0 && (
            <Button
              onClick={() => setBatchIds(pending.map((target) => target._id))}
            >
              Start next batch
            </Button>
          )}
        </div>
      )}
      <QuestionReviewHistory source="pruning" />
    </div>
  );
}
