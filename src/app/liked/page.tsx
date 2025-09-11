import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { HouseIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function LikedQuestionsPageContent() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: likedQuestions });

  if (!questions) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white flex items-center justify-center">

      </div>
    );
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleRemoveFavorite = (questionId: Id<"questions">) => {
    setLikedQuestions(likedQuestions.filter(id => id !== questionId));
  };

  const gradient = ['#667EEA', '#764BA2'];
  const isColorDark = (color: string) => {
    if (!color) return false;
    const [r, g, b] = color.match(/\w\w/g)!.map((hex) => parseInt(hex, 16));
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden p-4"
      style={{
        background: `linear-gradient(135deg, #764BA2, #667EEA, ${theme === "dark" ? "#000" : "#fff"})`
      }}
    >

      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <Link to="/">
          <button
            className="flex items-center gap-2 p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
            aria-label="Home"
          >
            <HouseIcon />
            Home
          </button>
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
      {questions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-lg">You haven't liked any questions yet.</p>
          <Link
            to="/"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "inline-block mt-4 font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            Start Exploring
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {questions.map((question: Doc<"questions">) => (
            <ModernQuestionCard
              key={question._id}
              question={question}
              isGenerating={false}
              isFavorite={true}
              onToggleFavorite={() => handleRemoveFavorite(question._id)}
            />
          ))}
        </div>
      )}
    </div>

  );
}

export default function LikedQuestionsPage() {
  return (
    <ErrorBoundary>
      <LikedQuestionsPageContent />
    </ErrorBoundary>
  );
} 