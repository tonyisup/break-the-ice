import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowBigRight, Heart, RefreshCcwDotIcon, Share2 } from 'lucide-react';
import { Doc } from '../../../convex/_generated/dataModel';
import { categories } from '../category-selector/category-selector';

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onNewQuestion?: () => void;
  onShare?: () => void;
}

export function ModernQuestionCard({
  question,
  isFavorite,
  onToggleFavorite,
  onNewQuestion,
  onShare
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  if (!question) return null;

  // Use the question's category or fall back to a default
  const category = categories.find(c => c.id === question.category) || categories.find(c => c.id === 'deep') || categories[0];
  const gradient = category.gradient;

  const handleShare = async () => {
    if (!question || !navigator.share) return;

    try {
      await navigator.share({
        title: 'Ice Breaker Question',
        text: question.text,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        initial={{ scale: .8, rotate: 0 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 50,
          damping: 7,
          duration: 0.3
        }}
        className="w-full max-w-md mx-auto"
      >
        <div
          className="w-full h-full rounded-[30px] p-[3px]"
          style={{
            background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`
          }}
        >
          <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col justify-between">
            {/* Category Badge */}
            <div className="bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {category.name}
              </span>
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

              {onNewQuestion && (
                <button
                  onClick={onNewQuestion}
                  className="bg-black/20 dark:bg-white/20 px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
                  title="New question"
                >
                  <ArrowBigRight size={24} className="text-white" />
                  <span className="sm:block hidden text-white font-semibold text-base">New Question</span>
                </button>
              )}

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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
