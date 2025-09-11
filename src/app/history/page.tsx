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

export default function HistoryPage() {
  const { history, removeQuestionFromHistory } = useQuestionHistory();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});

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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="p-4 flex justify-between items-center bg-white dark:bg-gray-800 shadow-md">
        <Link to="/" className="text-lg font-bold">
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold">History</h1>
        <div />
      </header>
      <main className="p-4">
        {history.length === 0 ? (
          <p className="text-center text-gray-500">No questions viewed yet.</p>
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
