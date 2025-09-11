import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { HouseIcon } from "lucide-react";

function LikedQuestionsPageContent() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: likedQuestions });
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});

  const styleColors = useMemo(() => {
    if (!styles) return {};
    return styles.reduce((acc, style) => {
      acc[style.name] = style.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [styles]);

  const toneColors = useMemo(() => {
    if (!tones) return {};
    return tones.reduce((acc, tone) => {
      acc[tone.name] = tone.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [tones]);

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
            className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Start Exploring
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {questions.map((question: Doc<"questions">) => {
            const styleColor = styleColors[question.style] || '#667EEA';
            const toneColor = toneColors[question.tone] || '#764BA2';
            const gradient = [styleColor, toneColor];
            return (
              <ModernQuestionCard
                key={question._id}
                question={question}
                isGenerating={false}
                isFavorite={true}
                onToggleFavorite={() => handleRemoveFavorite(question._id)}
                gradient={gradient}
              />
            );
          })}
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