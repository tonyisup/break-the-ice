import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  gradient: string[];
  toggleLike: (questionId: any) => void;
}

export const QuestionDisplay = ({
  isGenerating,
  currentQuestion,
  isFavorite,
  gradient,
  toggleLike,
}: QuestionDisplayProps) => {
  return (
    <div className="flex-1 flex items-center justify-center px-5 pb-8">
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
    </div>
  );
};
