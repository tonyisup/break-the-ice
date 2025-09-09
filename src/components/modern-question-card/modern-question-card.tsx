import React from 'react';
import { motion } from 'framer-motion';
import { Heart, Share2, ThumbsDown } from 'lucide-react';
import { Doc } from '../../../convex/_generated/dataModel';
import { BaseCard } from '../based-card/base-card';

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isGenerating: boolean;
  isFavorite: boolean;
  gradient?: string[];
  onToggleFavorite: () => void;
  onShare?: () => void;
  onHide: () => void;
}

export function ModernQuestionCard({
  question,
  isGenerating,
  isFavorite,
  gradient = ['#667EEA', '#764BA2'],
  onToggleFavorite,
  onShare,
  onHide,
}: ModernQuestionCardProps) {
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

  const baseCardGradient = {
    style: gradient[0],
    tone: gradient[1]
  }

  return (
    <BaseCard gradient={baseCardGradient}>
      {isGenerating ? (
        // Loading Spinner
        <div className="flex flex-col items-center justify-center space-y-4 h-[200px]">
          <motion.div
            className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 rounded-full"
            style={{
              borderTopColor: gradient[0]
            }}
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "linear"
            }}
          />
          <motion.p
            initial={{ scale: .9 }}
            animate={{ scale: 1.1 }}
            transition={{
              duration: 1,
              type: "linear",
              stiffness: 50,
              damping: 7,
              repeat: Infinity,
              repeatType: "reverse",
            }}
            className="text-gray-600 dark:text-gray-400 font-medium"
          >
            Generating question...
          </motion.p>
        </div>
      ) : (
        // Full Card Content
        question && <div className="w-full h-full flex flex-col justify-between">
          {/* Category Badge */}
          <div className="flex flex-row gap-2 justify-between">
            <div className="bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {question.style}
              </span>
            </div>

            <div className="bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between">
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
            <button
              onClick={onHide}
              className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
              title="Hide question"
            >
              <ThumbsDown size={24} className="text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>
      )}
    </BaseCard>
  );
}
