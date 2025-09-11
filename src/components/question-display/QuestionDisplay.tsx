import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";
import { motion, PanInfo } from "framer-motion";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  gradient: string[];
  toggleLike: (questionId: any) => void;
  onSwipe: () => void;
}

export const QuestionDisplay = ({
  isGenerating,
  currentQuestion,
  isFavorite,
  gradient,
  toggleLike,
  onSwipe,
}: QuestionDisplayProps) => {
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y < -100) {
      onSwipe();
    }
  };
  return (
    <motion.div
      key={currentQuestion?._id}
      className="flex-1 flex items-center justify-center px-5 pb-8"
      initial={{ y: 300, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -300, opacity: 0 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
    >
      <ModernQuestionCard
        isGenerating={isGenerating}
        question={currentQuestion}
        isFavorite={isFavorite}
        gradient={gradient}
        onToggleFavorite={() => currentQuestion && toggleLike(currentQuestion._id)}
        onShare={() => {
          if (currentQuestion && navigator.share) {
            void navigator.share({
              title: 'Ice Breaker Question',
              text: currentQuestion.text,
            });
          }
        }}
      />
    </motion.div>
  );
};
