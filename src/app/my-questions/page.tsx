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
import { SignInCTA } from "@/components/SignInCTA";
import { AddPersonalQuestionDialog } from "@/components/add-personal-question-dialog/AddPersonalQuestionDialog";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";

/** What a person's own question is to everyone else, in the words shown on its card. */
const statusLabel = (status: Doc<"questions">["status"]) =>
  status === "pending" ? "Waiting for review"
    : status === "public" || status === "approved" ? "Public"
    : "Private";

/** The questions a person wrote or remixed: where each stands, and where new ones are added. */
export default function MyQuestionsPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { effectiveTheme } = useTheme();
  const { hideStyle, hideTone } = useHideTaxonomy();
  const { likedQuestions, addLikedQuestion, removeLikedQuestion, hiddenQuestions, addHiddenStyle, addHiddenTone } = useStorageContext();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const myQuestions = useQuery(api.core.questions.getCustomQuestions, {});
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const makeQuestionPublic = useMutation(api.core.questions.makeQuestionPublic);
  const deletePersonalQuestion = useMutation(api.core.questions.deletePersonalQuestion);

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
      toast.error(typeof dataMessage === "string" ? dataMessage : "Couldn't submit the question. Please try again.");
    }
  };

  const handleDelete = async (questionId: Id<"questions">) => {
    if (!window.confirm("Delete this question? This can't be undone.")) return;
    try {
      await deletePersonalQuestion({ questionId });
      toast.success("Question deleted");
    } catch (error) {
      console.error("Error deleting question:", error);
      const dataMessage = convexErrorData(error)?.message;
      toast.error(typeof dataMessage === "string" ? dataMessage : "Failed to delete question.");
    }
  };

  const handleToggleLike = (questionId: Id<"questions">) => {
    if (likedQuestions.includes(questionId)) {
      removeLikedQuestion(questionId);
      toast.success("Removed from Liked", { action: { label: "Undo", onClick: () => addLikedQuestion(questionId) } });
    } else {
      addLikedQuestion(questionId);
      toast.success("Added to Liked");
    }
  };

  const gradient: [string, string] = effectiveTheme === "dark" ? ["#3B2554", "#262D54"] : ["#667EEA", "#A064DE"];

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})` }}
    >
      <Header />
      <AddPersonalQuestionDialog isOpen={isAddOpen} onOpenChange={setIsAddOpen} />

      <main className="container mx-auto p-4 pt-[calc(var(--header-h,4rem)+1.5rem)] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">My questions</h1>
          {isSignedIn && (
            <Button variant="opaque" className="min-h-11" onClick={() => setIsAddOpen(true)}>Add question</Button>
          )}
        </div>

        {!isLoaded || (isSignedIn && myQuestions === undefined) ? (
          <div className="flex flex-col items-center gap-3 py-12" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" aria-hidden="true"></div>
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white">Loading your questions…</span>
          </div>
        ) : !isSignedIn ? (
          <SignInCTA
            bgGradient={gradient}
            title="Sign in to write your own"
            featureHighlight={{ pre: "Add questions and", highlight: "remix the ones you like", post: "and keep them here." }}
          />
        ) : !myQuestions || myQuestions.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-black/50 px-6 py-8 text-center text-white">
            <p>You haven't added any questions yet. Write one, or use Remix on a question in the feed.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="opaque" className="min-h-11" onClick={() => setIsAddOpen(true)}>Add question</Button>
              <Link to="/app" className="inline-flex min-h-11 items-center rounded-lg border border-white/50 px-4 font-semibold hover:bg-white/10">
                Browse questions
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {myQuestions.map((question) => {
              const style = stylesMap.get(question.styleId || (question.style as string) || "");
              const tone = tonesMap.get(question.toneId || (question.tone as string) || "");
              return (
                <div key={question._id} className="flex flex-col gap-2">
                  {/* Where this question stands, which is what the number on the nav tab counts. */}
                  <div className="flex min-h-11 items-center justify-between gap-2">
                    <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                      {statusLabel(question.status)}
                    </span>
                    {question.status === "private" && (
                      <button
                        type="button"
                        onClick={() => { void handleSubmitForReview(question._id); }}
                        className="min-h-11 rounded-full border border-white/50 bg-black/40 px-4 text-xs font-semibold text-white hover:bg-black/60"
                      >
                        Submit for review
                      </button>
                    )}
                  </div>
                  <ModernQuestionCard
                    question={question}
                    isGenerating={false}
                    isFavorite={likedQuestions.includes(question._id)}
                    isHidden={hiddenQuestions.includes(question._id)}
                    gradient={[style?.color || "#667EEA", tone?.color || "#764BA2"]}
                    style={style}
                    tone={tone}
                    onToggleFavorite={() => handleToggleLike(question._id)}
                    onHideStyle={hideStyle}
                    onHideTone={hideTone}
                    onDelete={() => { void handleDelete(question._id); }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
