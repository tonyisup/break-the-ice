import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ModernQuestionCard } from "@/components/modern-question-card";
// import { HouseIcon } from "lucide-react";

import { cn, isColorDark } from "@/lib/utils";

import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/header";


function LikedQuestionsPageContent() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: likedQuestions });
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


  const handleRemoveFavorite = (questionId: Id<"questions">) => {
    setLikedQuestions(likedQuestions.filter(id => id !== questionId));
  };
  
  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];
  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${theme === "dark" ? gradient[0] : gradientLight[0]}, ${theme === "dark" ? gradient[1] : gradientLight[1]}, ${theme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header 
        homeLinkSlot="liked"
        gradient={gradient} />

      {questions && questions.length === 0 ? (
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
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          <AnimatePresence>
          {questions && questions.map((question: Doc<"questions">) => {
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
                    handleRemoveFavorite(question._id);
                  }
                }}
                onDoubleClick={() => {
                  void handleRemoveFavorite(question._id);
                }}
              >
                <ModernQuestionCard
                  question={question}
                  isGenerating={false}
                  isFavorite={true}
                  onToggleFavorite={() => handleRemoveFavorite(question._id)}
                  onToggleHidden={() => handleRemoveFavorite(question._id)}
                  gradient={gradient}
                />
              </motion.div>
            );
          })}
          </AnimatePresence>
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