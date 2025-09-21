import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";
import { motion, PanInfo } from "framer-motion";
import { useState } from "react";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  toggleLike: (questionId: any) => void;
  onSwipe: () => void;
  toggleHide: (questionId: any) => void;
  onHideStyle: (styleId: string) => void;
  onHideTone: (toneId: string) => void;
  disabled?: boolean;
}

export const QuestionDisplay = ({
  isGenerating,
  currentQuestion,
  isFavorite,
  toggleLike,
  onSwipe,
  toggleHide,
  onHideStyle,
  onHideTone,
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
  const handleHideStyle = () => {
    if (currentQuestion) {
      onHideStyle(currentQuestion.style as string);
    }
  };
  const handleHideTone = () => {
    if (currentQuestion) {
      onHideTone(currentQuestion.tone as string);
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
        onToggleFavorite={() => currentQuestion && toggleLike(currentQuestion._id)}
        onToggleHidden={() => currentQuestion && toggleHide(currentQuestion._id)}
        onHideStyle={handleHideStyle}
        onHideTone={handleHideTone}
        disabled={disabled}
      />
    </motion.div>
  );
};
