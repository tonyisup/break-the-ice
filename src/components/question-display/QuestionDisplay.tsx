import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";
import { motion, PanInfo } from "framer-motion";
import { useState } from "react";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  isHidden?: boolean;
  gradient: string[];
  style?: Doc<"styles">;
  tone?: Doc<"tones">;
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
  isHidden = false,
  gradient,
  style,
  tone,
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
    if (info.offset.x < -100) {
      setDragDirection("left");
      onSwipe();
    } else if (info.offset.x > 100) {
      setDragDirection("right");
      onSwipe();
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
    <div
      className="flex-1 flex items-center justify-center px-5 pb-8"
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
        isHidden={isHidden}
        gradient={gradient}
        style={style}
        tone={tone}
        onToggleFavorite={() => currentQuestion && toggleLike(currentQuestion._id)}
        onToggleHidden={() => currentQuestion && toggleHide(currentQuestion._id)}
        onHideStyle={handleHideStyle}
        onHideTone={handleHideTone}
        disabled={disabled}
      />
    </div>
  );
};
