import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTheme } from "../../hooks/useTheme";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { useHideTaxonomy } from "../../hooks/useHideTaxonomy";
import { Header } from "../../components/header";
import { useEffect } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { ModernQuestionCard } from "@/components/modern-question-card";

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveTheme } = useTheme();
  const { addQuestionHistoryEntry } = useQuestionHistory();
  const { likedQuestions, addLikedQuestion, removeLikedQuestion, hiddenQuestions, addHiddenQuestion, removeHiddenQuestion, addHiddenStyle, addHiddenTone, sessionId } = useStorageContext();
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

  const question = useQuery(api.core.questions.getQuestionById, id ? { id } : "skip");
  const style = useQuery(api.core.styles.getStyle, (question && question.style) ? { id: question.style } : "skip");
  const tone = useQuery(api.core.tones.getTone, (question && question.tone) ? { id: question.tone } : "skip");

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
      // If it was hidden, remove it from hidden
      if (hiddenQuestions.includes(questionId)) {
        removeHiddenQuestion(questionId);
      }
      addLikedQuestion(questionId);
      // Counting the like is separate from saving it; a failure there is not shown to the person.
      void recordAnalytics({
        questionId,
        event: "liked",
        viewDuration: 0, // No view duration for shared questions
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
      // If it was liked, remove it from Liked. Undo puts both back.
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
      toast.success(wasLiked ? "Question hidden and removed from Liked" : "Question hidden", {
        action: {
          label: "Undo",
          onClick: () => {
            removeHiddenQuestion(questionId);
            if (wasLiked) addLikedQuestion(questionId);
          },
        },
      });
    }
  };

  // Hiding a style or tone keeps the person on this page, with a toast they can undo from.
  const { hideStyle: handleHideStyle, hideTone: handleHideTone } = useHideTaxonomy();

  const isFavorite = question ? likedQuestions.includes(question._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = effectiveTheme === "dark" ? "#000" : "#fff";

  const isColorDark = (color: string) => {
    if (!color) return false;
    const [r, g, b] = color.match(/\w\w/g)!.map((hex) => parseInt(hex, 16));
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  const isLoadingQuestion = question === undefined;
  const isLoadingStyle = question?.style && style === undefined;
  const isLoadingTone = question?.tone && tone === undefined;

  if (isLoadingQuestion || isLoadingStyle || isLoadingTone) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status">
        <Header />
        <span className="sr-only">Loading question…</span>
        <div
          className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 rounded-full animate-spin"
          style={{
            borderTopColor: gradient[0],
            borderBottomColor: gradient[1]
          }}
        />
      </div>
    );
  }

  if (question === null) {
    return (
      <div
        className="min-h-screen"
        style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradientTarget}, ${gradient[1]})` }}
      >
        <Header />
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-black/60 px-6 py-8 text-center text-white">
          <h1 className="text-2xl font-bold">Question not found</h1>
          <p className="text-white">This question may have been removed, or the link is wrong.</p>
          <Link
            to="/app"
            className="min-h-11 inline-flex items-center rounded-lg bg-white/20 px-4 font-bold backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            Browse questions
          </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradientTarget}, ${gradient[1]})`
      }}
    >
      <Header />
      <main className="flex-1 flex flex-col px-4 pt-[calc(var(--header-h,4rem)+1.5rem)]">
        <ModernQuestionCard
                isGenerating={false}  
                question={question}
                isFavorite={isFavorite}
                isHidden={question ? hiddenQuestions.includes(question._id) : false}
                gradient={gradient}
                style={style}
                tone={tone}
                onToggleFavorite={() => { if (question) void toggleLike(question._id); }}
                onToggleHidden={() => { if (question) void toggleHide(question._id); }}
                onHideStyle={handleHideStyle}
                onHideTone={handleHideTone}
              />
        <div className="flex justify-center p-4">
          <Link
            to="/app"
            className={cn("bg-black/50", "inline-flex min-h-11 items-center font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-black/60 transition-colors text-white")}
          >
            Get more questions
          </Link>
        </div>
      </main>
    </div>
  );
}
