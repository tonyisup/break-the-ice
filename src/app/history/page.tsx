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
// import { HouseIcon } from "lucide-react";
import { Header } from "@/components/header";

export default function HistoryPage() {
  const { history, removeQuestionFromHistory } = useQuestionHistory();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});
  const { theme } = useTheme();

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
  
  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
    style={{
      background: `linear-gradient(135deg, ${theme === "dark" ? gradient[0] : gradientLight[0]}, ${theme === "dark" ? gradient[1] : gradientLight[1]}, ${theme === "dark" ? "#000" : "#fff"})`
    }}
    >
      <Header 
        gradient={gradient} 
        homeLinkSlot="history" />
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
                  onDoubleClick={() => {
                    void toggleLike(question._id);
                  }}
                >
                  <ModernQuestionCard
                    question={question}
                    isGenerating={false}
                    isFavorite={likedQuestions.includes(question._id)}
                    onToggleFavorite={() => void toggleLike(question._id)}
                    onToggleHidden={() => void removeQuestionFromHistory(question._id)}
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
