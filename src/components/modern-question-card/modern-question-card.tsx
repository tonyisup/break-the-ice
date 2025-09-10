import React, { useRef } from 'react';
import { Heart, Share2 } from 'lucide-react';
import { Doc } from '../../../convex/_generated/dataModel';

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isGenerating: boolean;
  isFavorite: boolean;
  gradient?: string[];
  onToggleFavorite: () => void;
  onShare?: () => void;
}

export function ModernQuestionCard({
  question,
  isGenerating,
  isFavorite,
  gradient = ['#667EEA', '#764BA2'],
  onToggleFavorite,
  onShare,
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleShare = () => {
    if (!question || !navigator.share) return;

    try {
      void navigator.share({
        title: 'Ice Breaker Question',
        text: question.text,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <div
      key={question?._id}
      ref={cardRef}
      className="w-full max-w-md mx-auto"
    >
      <div
        className="w-full h-full rounded-[30px] p-[3px]"
        style={{
          background: `linear-gradient(135deg, ${gradient[1]}, ${gradient[0]})`
        }}
      >
        <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col justify-center items-center">
          {isGenerating && !question ? (
            // Loading Spinner
            <div className="flex flex-col items-center justify-center space-y-4 h-[200px]">
              <div
                className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 rounded-full animate-spin"
                style={{
                  borderTopColor: gradient[0],
                  borderBottomColor: gradient[1]
                }}
              />
              <p
                className="text-gray-600 dark:text-gray-400 font-medium"
              >
                Generating question...
              </p>
            </div>
          ) : (
            // Full Card Content
            question && <div className="w-full h-full flex flex-col justify-between">
              {/* Category Badge */}
              <div className="flex flex-row gap-2 justify-between">
                <div className="border-t-2 border-l-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between"
                  style={{
                    borderTopColor: gradient[0],
                    borderLeftColor: gradient[0]
                  }}
                >
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {question.style}
                  </span>
                </div>

                <div className="border-b-2 border-r-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between"
                  style={{
                    borderBottomColor: gradient[1],
                    borderRightColor: gradient[1]
                  }}
                >
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {question.tone}
                  </span>
                </div>
              </div>

              {/* Question Text */}
              <div className="py-8 flex-1 flex items-center justify-center text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-relaxed">
                  {question.text}
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center items-center gap-3">
                <button
                  onClick={onToggleFavorite}
                  className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                  title="Toggle favorite"
                >
                  <Heart
                    size={24}
                    className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-400'}
                  />
                </button>

                {typeof navigator.share === 'function' && (
                  <button
                    onClick={handleShare}
                    className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                    title="Share question"
                  >
                    <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
