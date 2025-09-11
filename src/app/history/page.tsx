import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { ModernQuestionCard } from "../../components/modern-question-card";
import { motion, AnimatePresence } from "framer-motion";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "@/hooks/useTheme";
import { HouseIcon } from "lucide-react";

export default function HistoryPage() {
  const { history, removeQuestionFromHistory } = useQuestionHistory();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});
  const { theme, setTheme } = useTheme();

  const styleColors = useMemo(() => {
    if (!styles) return {};
    return styles.reduce((acc, style) => {
      acc[style.id] = style.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [styles]);

  const toneColors = useMemo(() => {
    if (!tones) return {};
    return tones.reduce((acc, tone) => {
      acc[tone.id] = tone.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [tones]);

  const toggleLike = async (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);

    if (isLiked) {
      setLikedQuestions(likedQuestions.filter(id => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration: 0, // Not applicable in history page
      });
      toast.success("Added to favorites!");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <Link to="/">
          <button
            className="flex items-center gap-2 p-2 rounded-lg bg-black/20 dark:bg-white/20 backdrop-blur-sm hover:bg-black/30 dark:hover:bg-white/30 transition-colors text-white"
            aria-label="Home"
          >
            <HouseIcon />
            Home
          </button>
        </Link>
        <h1 className="text-xl font-bold text-center text-white">History</h1>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-black/20 dark:bg-white/20 backdrop-blur-sm hover:bg-black/30 dark:hover:bg-white/30 transition-colors text-white"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </div>
      <main>
        {history.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">No questions viewed yet.</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
            {history.map((question) => {
              const styleColor = (question.style && styleColors[question.style]) || '#667EEA';
              const toneColor = (question.tone && toneColors[question.tone]) || '#764BA2';
              const gradient = [styleColor, toneColor];
              return (
                <motion.div
                  key={question._id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={(event, info) => {
                    if (Math.abs(info.offset.x) > 100) {
                      removeQuestionFromHistory(question._id);
                    }
                  }}
                >
                  <ModernQuestionCard
                    question={question}
                    isGenerating={false}
                    isFavorite={likedQuestions.includes(question._id)}
                    onToggleFavorite={() => toggleLike(question._id)}
                    gradient={gradient}
                  />
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
