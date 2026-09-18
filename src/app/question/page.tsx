import { handleAsync, reportAsyncError } from "@/lib/async";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useTheme } from "../../hooks/useTheme";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { Header } from "../../components/header";
import { useEffect } from "react";
import { toast } from "sonner";

import { ModernQuestionCard } from "@/components/modern-question-card";

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useTheme();
  const { addQuestionHistoryEntry } = useQuestionHistory();
  const { likedQuestions, addLikedQuestion, removeLikedQuestion, hiddenQuestions, addHiddenQuestion, removeHiddenQuestion, addHiddenStyle, addHiddenTone } = useStorageContext();
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
      toast.success("Removed from favorites");
    } else {
      // If it was hidden, remove it from hidden
      if (hiddenQuestions.includes(questionId)) {
        removeHiddenQuestion(questionId);
      }
      addLikedQuestion(questionId);
      await recordAnalytics({
        questionId,
        event: "liked",
        viewDuration: 0, // No view duration for shared questions
      });
      toast.success("Added to favorites!");
    }
  };

  const toggleHide = async (questionId: Id<"questions">) => {
    const isHidden = hiddenQuestions.includes(questionId);
    if (isHidden) {
      removeHiddenQuestion(questionId);
      toast.success("Question unhidden");
    } else {
      // If it was liked, remove it from favorites
      if (likedQuestions.includes(questionId)) {
        removeLikedQuestion(questionId);
      }
      addHiddenQuestion(questionId);
      await recordAnalytics({
        questionId,
        event: "hidden",
        viewDuration: 0,
      });
      toast.success("Question hidden");
    }
  };

  const handleHideStyle = (styleId: Id<"styles">) => {
    addHiddenStyle(styleId);
    void Promise.resolve(navigate("/app")).catch(reportAsyncError);
  }
  const handleHideTone = (toneId: Id<"tones">) => {
    addHiddenTone(toneId);
    void Promise.resolve(navigate("/app")).catch(reportAsyncError);
  }

  const isFavorite = question ? likedQuestions.includes(question._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];

  const isLoadingQuestion = question === undefined;
  const isLoadingStyle = question?.style && style === undefined;
  const isLoadingTone = question?.tone && tone === undefined;

  if (isLoadingQuestion || isLoadingStyle || isLoadingTone) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center"><h1 className="text-2xl font-bold">Question not found</h1><Link to="/app" className="underline">Browse questions</Link></div>
      </div>
    );
  }

  return (
    <div className="app-shell overflow-x-clip">
      <Header />
      <main className="flex-1 flex flex-col pt-20">
        <ModernQuestionCard
                isGenerating={false}
                question={question}
                isFavorite={isFavorite}
                isHidden={question ? hiddenQuestions.includes(question._id) : false}
                style={style}
                tone={tone}
                onToggleFavorite={handleAsync(() => question && toggleLike(question._id))}
                onToggleHidden={handleAsync(() => question && toggleHide(question._id))}
                onHideStyle={handleHideStyle}
                onHideTone={handleHideTone}
              />
        <div className="flex justify-center p-4">
          <Link
            to="/app"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
          >
            Get more questions
          </Link>
        </div>
      </main>
    </div>
  );
}
