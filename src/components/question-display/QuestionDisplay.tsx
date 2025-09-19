import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";
import { motion, PanInfo } from "framer-motion";
import { useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  gradient: string[];
  toggleLike: (questionId: any) => void;
  onSwipe: () => void;
  toggleHide: (questionId: any) => void;
  onHideItem?: (item: 'style' | 'tone', id: Id<'styles'> | Id<'tones'>) => void;
  disabled?: boolean;
}

export const QuestionDisplay = ({
  isGenerating,
  currentQuestion,
  isFavorite,
  gradient,
  toggleLike,
  onSwipe,
  toggleHide,
  onHideItem,
  disabled = false,
}: QuestionDisplayProps) => {
  const [dragDirection, setDragDirection] = useState<"left" | "right">("right");
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled) return;
    if (info.offset.y > 100) {
      if (currentQuestion) {
        toggleLike(currentQuestion._id);
      }
    } else if (info.offset.x < -100) {
      setDragDirection("left");
      onSwipe();
    } else if (info.offset.x > 100) {
      setDragDirection("right");
      onSwipe();
    } else if (info.offset.y < -100) {
      handleShare();
    }
  };
  const handleShare = () => {
    if (currentQuestion && navigator.share) {
      const shareUrl = `${window.location.origin}/question/${currentQuestion._id}`;
      void navigator.share({
        title: 'Ice Breaker Question',
        text: currentQuestion.text,
        url: shareUrl,
      });
    }
  };
  return (
    <motion.div
      key={currentQuestion?._id}
      className="flex-1 flex items-center justify-center px-5 pb-8"
      initial={{ x: 0, y:-300, opacity: 0 }}
      animate={{ x: 0, y:0, opacity: 1 }}
      exit={{ x: dragDirection === "left" ? -300 : 300, opacity: 0 }}
      drag={!disabled}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      onDoubleClick={() => {
        if (currentQuestion && !disabled) {
          toggleLike(currentQuestion._id);
        }
      }}
    >
      <ModernQuestionCard
        isGenerating={isGenerating}
        question={currentQuestion}
        isFavorite={isFavorite}
        gradient={gradient}
        onToggleFavorite={() => currentQuestion && toggleLike(currentQuestion._id)}
        onToggleHidden={() => currentQuestion && toggleHide(currentQuestion._id)}
        onHide={(item, id) => onHideItem?.(item, id)}
        disabled={disabled}
      />
    </motion.div>
  );
};
