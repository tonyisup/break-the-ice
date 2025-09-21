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
  const { addQuestionToHistory } = useQuestionHistory();
  const { likedQuestions, setLikedQuestions } = useStorageContext();
  const recordAnalytics = useMutation(api.questions.recordAnalytics);

  const question = useQuery(api.questions.getQuestionById, id ? { id } : "skip");
  const style = useQuery(api.styles.getStyle, (question && question.style) ? { id: question.style } : "skip");
  const tone = useQuery(api.tones.getTone, (question && question.tone) ? { id: question.tone } : "skip");

  useEffect(() => {
    if (question) {
      addQuestionToHistory(question);
    }
  }, [question, addQuestionToHistory]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleLike = async (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);
    if (isLiked) {
      setLikedQuestions(likedQuestions.filter((id) => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration: 0, // No view duration for shared questions
      });
      toast.success("Added to favorites!");
    }
  };

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
        background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`,
      }}
    >
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        isColorDark={isColorDark}
        gradient={gradient}
      />
      <main className="flex-1 flex flex-col">
        <QuestionDisplay
          isGenerating={false}
          currentQuestion={question}
          isFavorite={isFavorite}
          gradient={gradient}
          toggleLike={toggleLike}
          onSwipe={() => navigate("/")}
          toggleHide={() => navigate("/")}
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
