import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function QuestionReviewHistory({
  source,
}: {
  source: "pruning" | "duplicates";
}) {
  const history = useQuery(api.admin.pruning.getReviewHistory, { source });
  const undo = useMutation(api.admin.pruning.undoReview);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold focus-visible:outline-ring">
        Recent review history
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Last 30 decisions. Undo restores the previous text and status when no
        newer review has changed the question.
      </p>
      {history === undefined ? (
        <p className="mt-4 text-sm" role="status">
          Loading history…
        </p>
      ) : history.length === 0 ? (
        <p className="mt-4 text-sm">No recorded decisions yet.</p>
      ) : (
        <ol className="mt-4 divide-y">
          {history.map((review) => (
            <li key={review._id} className="py-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium capitalize">
                  {review.outcome.replace(/_/g, " ")}
                  {review.undoneAt !== undefined ? " · Undone" : ""}
                </p>
                {review.undoable && review.undoneAt === undefined && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy(review._id);
                      void undo({ reviewId: review._id })
                        .then(() => toast.success("Review undone"))
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not undo review",
                          ),
                        )
                        .finally(() => setBusy(null));
                    }}
                  >
                    {busy === review._id ? "Undoing…" : "Undo"}
                  </Button>
                )}
              </div>
              <p className="text-sm">{review.reason}</p>
              {review.changes.map((change) => (
                <div
                  className="text-sm text-muted-foreground"
                  key={change.questionId}
                >
                  <p className="break-words">
                    {change.before.text ?? "Untitled question"}
                  </p>
                  {change.before.text !== change.after.text && (
                    <p className="text-foreground">
                      Saved: {change.after.text}
                    </p>
                  )}
                  <p>
                    Status: {change.before.status ?? "public (legacy)"} →{" "}
                    {change.after.status ?? "public (legacy)"}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground break-all">
                {new Date(review._creationTime).toLocaleString()} ·{" "}
                {review.reviewer}
              </p>
              {review.undoneAt !== undefined && (
                <p className="text-xs text-muted-foreground break-all">
                  Undone {new Date(review.undoneAt).toLocaleString()} ·{" "}
                  {review.undoneBy}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
