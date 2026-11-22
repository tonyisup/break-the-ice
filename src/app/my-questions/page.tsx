import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { convexErrorData } from "../../../convex/lib/errorData";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { useTheme } from "../../hooks/useTheme";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useHideTaxonomy } from "../../hooks/useHideTaxonomy";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SignInCTA } from "@/components/SignInCTA";
import { AddPersonalQuestionDialog } from "@/components/add-personal-question-dialog/AddPersonalQuestionDialog";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";
import { Plus } from "lucide-react";

const statusLabel = (status: Doc<"questions">["status"]) =>
  status === "pending"
    ? "Waiting for review"
    : status === "public" || status === "approved"
      ? "Public"
      : "Private";

/** The questions a person wrote or remixed: where each stands, and where new ones are added. */
export default function MyQuestionsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  useTheme();
  const { hideStyle, hideTone } = useHideTaxonomy();
  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    hiddenQuestions,
  } = useStorageContext();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<Id<"questions"> | null>(
    null,
  );

  const myQuestions = useQuery(api.core.questions.getCustomQuestions, {});
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const makeQuestionPublic = useMutation(api.core.questions.makeQuestionPublic);
  const deletePersonalQuestion = useMutation(
    api.core.questions.deletePersonalQuestion,
  );

  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    (styles ?? []).forEach((style) => {
      map.set(style.id, style as unknown as Doc<"styles">);
      map.set(style._id, style as unknown as Doc<"styles">);
    });
    return map;
  }, [styles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    (tones ?? []).forEach((tone) => {
      map.set(tone.id, tone as unknown as Doc<"tones">);
      map.set(tone._id, tone as unknown as Doc<"tones">);
    });
    return map;
  }, [tones]);

  const handleSubmitForReview = async (questionId: Id<"questions">) => {
    try {
      await makeQuestionPublic({ questionId });
      toast.success("Question submitted for review!");
    } catch (error) {
      console.error("Error making question public:", error);
      const dataMessage = convexErrorData(error)?.message;
      toast.error(
        typeof dataMessage === "string"
          ? dataMessage
          : "Couldn't submit the question. Please try again.",
      );
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const targetId = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deletePersonalQuestion({ questionId: targetId });
      toast.success("Question deleted");
    } catch (error) {
      console.error("Error deleting question:", error);
      const dataMessage = convexErrorData(error)?.message;
      toast.error(
        typeof dataMessage === "string"
          ? dataMessage
          : "Failed to delete question.",
      );
    }
  };

  const handleToggleLike = (questionId: Id<"questions">) => {
    if (likedQuestions.includes(questionId)) {
      removeLikedQuestion(questionId);
      toast.success("Removed from Liked", {
        action: { label: "Undo", onClick: () => addLikedQuestion(questionId) },
      });
    } else {
      addLikedQuestion(questionId);
      toast.success("Added to Liked");
    }
  };

  return (
    <div className="deck-canvas min-h-screen text-foreground">
      <Header />
      <AddPersonalQuestionDialog isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-[calc(var(--header-h,4rem)+1.75rem)] sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
            My questions
          </h1>
          {isSignedIn && (
            <Button
              className="min-h-11 rounded-full px-5 font-semibold"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add question
            </Button>
          )}
        </div>

        {!isLoaded || (isSignedIn && myQuestions === undefined) ? (
          <div className="flex flex-col items-center gap-3 py-12" role="status">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-muted-foreground">
              Loading your questions…
            </span>
          </div>
        ) : !isSignedIn ? (
          <SignInCTA
            title="Sign in to write your own"
            featureHighlight={{
              pre: "Add questions and",
              highlight: "remix the ones you like",
              post: "and keep them here.",
            }}
          />
        ) : !myQuestions || myQuestions.length === 0 ? (
          <div className="deck-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              You haven't added any questions yet. Write one, or use Remix on a
              question in the feed.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                className="min-h-11 rounded-full px-5 font-semibold"
                onClick={() => setIsAddOpen(true)}
              >
                Add question
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-11 rounded-full px-5 font-semibold"
              >
                <Link to="/app">Browse questions</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {myQuestions.map((question) => {
              const style = stylesMap.get(
                question.styleId || (question.style as string) || "",
              );
              const tone = tonesMap.get(
                question.toneId || (question.tone as string) || "",
              );
              return (
                <div key={question._id} className="flex flex-col gap-2.5">
                  <div className="flex min-h-10 items-center justify-between gap-2 px-1">
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {statusLabel(question.status)}
                    </span>
                    {question.status === "private" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void handleSubmitForReview(question._id);
                        }}
                        className="h-9 rounded-full border-border bg-card px-3.5 text-xs font-semibold"
                      >
                        Submit for review
                      </Button>
                    )}
                  </div>
                  <ModernQuestionCard
                    question={question}
                    isGenerating={false}
                    isFavorite={likedQuestions.includes(question._id)}
                    isHidden={hiddenQuestions.includes(question._id)}
                    gradient={[
                      style?.color || "#0E7490",
                      tone?.color || "#6366F1",
                    ]}
                    style={style}
                    tone={tone}
                    onToggleFavorite={() => handleToggleLike(question._id)}
                    onHideStyle={hideStyle}
                    onHideTone={hideTone}
                    onDelete={() => setPendingDeleteId(question._id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this question?"
        description="This permanently removes your question and can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
