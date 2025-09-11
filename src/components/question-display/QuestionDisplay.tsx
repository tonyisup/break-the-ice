import { ModernQuestionCard } from "../modern-question-card";
import { Doc } from "../../../convex/_generated/dataModel";

interface QuestionDisplayProps {
  isGenerating: boolean;
  currentQuestion: Doc<"questions"> | null;
  isFavorite: boolean;
  gradient: string[];
  toggleLike: (questionId: any) => void;
  onShare?: () => void;
  toggleHide: (questionId: any) => void;
}

export const QuestionDisplay = ({
  isGenerating,
  currentQuestion,
  isFavorite,
  gradient,
  toggleLike,

  onShare,

  toggleHide,

}: QuestionDisplayProps) => {
  return (
    <div className="flex-1 flex items-center justify-center px-5 pb-8">
      <ModernQuestionCard
        isGenerating={isGenerating}
        question={currentQuestion}
        isFavorite={isFavorite}
        gradient={gradient}
        onToggleFavorite={() => currentQuestion && toggleLike(currentQuestion._id)}

        onShare={onShare ?? (() => {

        onToggleHidden={() => currentQuestion && toggleHide(currentQuestion._id)}
        onShare={() => {

          if (currentQuestion && navigator.share) {
            const shareUrl = `${window.location.origin}/question/${currentQuestion._id}`;
            void navigator.share({
              title: 'Ice Breaker Question',
              text: currentQuestion.text,
              url: shareUrl,
            });
          }
        })}
      />
    </div>
  );
};
