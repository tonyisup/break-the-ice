import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTheme } from "../../hooks/useTheme";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { useHideTaxonomy } from "../../hooks/useHideTaxonomy";
import { Header } from "../../components/header";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { toast } from "sonner";
import { ModernQuestionCard } from "@/components/modern-question-card";

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const { addQuestionHistoryEntry } = useQuestionHistory();
  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    hiddenQuestions,
    addHiddenQuestion,
    removeHiddenQuestion,
    sessionId,
  } = useStorageContext();
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

  const question = useQuery(
    api.core.questions.getQuestionById,
    id ? { id } : "skip",
  );
  const style = useQuery(
    api.core.styles.getStyle,
    question && question.style ? { id: question.style } : "skip",
  );
  const tone = useQuery(
    api.core.tones.getTone,
    question && question.tone ? { id: question.tone } : "skip",
  );

  useEffect(() => {
    if (question) {
      addQuestionHistoryEntry(question);
    }
  }, [question, addQuestionHistoryEntry]);

  const toggleLike = async (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);
    if (isLiked) {
      removeLikedQuestion(questionId);
      toast.success("Removed from Liked");
    } else {
      if (hiddenQuestions.includes(questionId)) {
        removeHiddenQuestion(questionId);
      }
      addLikedQuestion(questionId);
      void recordAnalytics({
        questionId,
        event: "liked",
        viewDuration: 0,
        sessionId: sessionId || undefined,
      }).catch((error) => console.error("Error recording like:", error));
      toast.success("Added to Liked");
    }
  };

  const toggleHide = async (questionId: Id<"questions">) => {
    const isHidden = hiddenQuestions.includes(questionId);
    if (isHidden) {
      removeHiddenQuestion(questionId);
      toast.success("Question unhidden");
    } else {
      const wasLiked = likedQuestions.includes(questionId);
      if (wasLiked) {
        removeLikedQuestion(questionId);
      }
      addHiddenQuestion(questionId);
      void recordAnalytics({
        questionId,
        event: "hidden",
        viewDuration: 0,
      }).catch((error) => console.error("Error recording hide:", error));
      toast.success(
        wasLiked ? "Question hidden and removed from Liked" : "Question hidden",
        {
          action: {
            label: "Undo",
            onClick: () => {
              removeHiddenQuestion(questionId);
              if (wasLiked) addLikedQuestion(questionId);
            },
          },
        },
      );
    }
  };

  const { hideStyle: handleHideStyle, hideTone: handleHideTone } =
    useHideTaxonomy();

  const isFavorite = question ? likedQuestions.includes(question._id) : false;
  const gradient =
    style?.color && tone?.color
      ? [style.color, tone.color]
      : ["#0E7490", "#6366F1"];
  const isDark = effectiveTheme === "dark";

  const isLoadingQuestion = question === undefined;
  const isLoadingStyle = question?.style && style === undefined;
  const isLoadingTone = question?.tone && tone === undefined;

  if (isLoadingQuestion || isLoadingStyle || isLoadingTone) {
    return (
      <div
        className="deck-canvas flex min-h-screen items-center justify-center"
        role="status"
      >
        <Header />
        <span className="sr-only">Loading question…</span>
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-border border-t-primary"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (question === null) {
    return (
      <div className="deck-canvas min-h-screen text-foreground">
        <Header />
        <main className="flex min-h-screen items-center justify-center px-4 pt-[var(--header-h,4rem)]">
          <div className="deck-card flex max-w-md flex-col items-center gap-4 px-7 py-10 text-center">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-card-foreground">
              Question not found
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This question may have been removed, or the link is wrong.
            </p>
            <Button asChild className="min-h-11 rounded-full px-6 font-semibold">
              <Link to="/app">Browse questions</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="deck-canvas relative min-h-screen overflow-x-clip text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: isDark
            ? `radial-gradient(55% 45% at 20% 15%, color-mix(in srgb, ${gradient[0]} 20%, transparent), transparent 72%), radial-gradient(55% 45% at 80% 80%, color-mix(in srgb, ${gradient[1]} 18%, transparent), transparent 72%)`
            : `radial-gradient(55% 45% at 20% 15%, color-mix(in srgb, ${gradient[0]} 15%, transparent), transparent 72%), radial-gradient(55% 45% at 80% 80%, color-mix(in srgb, ${gradient[1]} 14%, transparent), transparent 72%)`,
        }}
      />
      <Header />
      <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-16 pt-[calc(var(--header-h,4rem)+2rem)]">
        <h1 className="sr-only">Shared question</h1>
        <ModernQuestionCard
          isGenerating={false}
          question={question}
          isFavorite={isFavorite}
          isHidden={question ? hiddenQuestions.includes(question._id) : false}
          gradient={gradient}
          style={style}
          tone={tone}
          onToggleFavorite={() => {
            if (question) void toggleLike(question._id);
          }}
          onToggleHidden={() => {
            if (question) void toggleHide(question._id);
          }}
          onHideStyle={handleHideStyle}
          onHideTone={handleHideTone}
        />
        <div className="mt-6 flex justify-center">
          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-full border-border bg-card px-6 font-semibold shadow-sm"
          >
            <Link to="/app">Get more questions</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
