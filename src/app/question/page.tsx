import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id, Doc } from "../../../convex/_generated/dataModel";
import { useTheme } from "../../hooks/useTheme";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { Header } from "../../components/header";
import { useEffect } from "react";
import { QuestionDisplay } from "../../components/question-display";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

export default function QuestionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { addQuestionHistoryEntry } = useQuestionHistory();
  const { likedQuestions, addLikedQuestion, removeLikedQuestion, setLikedQuestions, hiddenQuestions, addHiddenQuestion, removeHiddenQuestion, addHiddenStyle, addHiddenTone } = useStorageContext();
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

  const question = useQuery(api.core.questions.getQuestionById, id ? { id } : "skip");
  const style = useQuery(api.core.styles.getStyle, (question && question.style) ? { id: question.style } : "skip");
  const tone = useQuery(api.core.tones.getTone, (question && question.tone) ? { id: question.tone } : "skip");

  useEffect(() => {
    if (question) {
      addQuestionHistoryEntry(question);
    }
  }, [question, addQuestionHistoryEntry]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

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

  const handleHideStyle = (styleId: string) => {
    addHiddenStyle(styleId);
    navigate("/app");
  }
  const handleHideTone = (toneId: string) => {
    addHiddenTone(toneId);
    navigate("/app");
  }

  const isFavorite = question ? likedQuestions.includes(question._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";

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
        <div>Question not found</div>
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
      <Header
        gradient={gradient}
      />
      <main className="flex-1 flex flex-col pt-20">
        <QuestionDisplay
          isGenerating={false}
          currentQuestion={question}
          isFavorite={isFavorite}
          isHidden={question ? hiddenQuestions.includes(question._id) : false}
          gradient={gradient}
          toggleLike={toggleLike}
          onSwipe={() => navigate("/")}
          toggleHide={() => question && toggleHide(question._id)}
          onHideStyle={handleHideStyle}
          onHideTone={handleHideTone}
        />
        <div className="flex justify-center p-4">
          <Link
            to="/"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            Get more questions
          </Link>
        </div>
      </main>
    </div>
  );
}
