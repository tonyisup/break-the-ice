import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { HouseIcon } from "lucide-react";

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
  return (
    <div
      className="min-h-screen transition-colors overflow-hidden p-4"
      style={{
        background: `linear-gradient(135deg, #764BA2, #667EEA, ${theme === "dark" ? "#000" : "#fff"})`
      }}
    >

      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <Link to="/" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
          <HouseIcon />
          Home
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
            className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
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