import React, { useMemo, useRef, useState } from 'react';
import { Heart, Share2, ThumbsDown } from '@/components/ui/icons/icons';
import { Doc } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { Icon, IconComponent } from '../ui/icons/icon';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer/item-detail-drawer';
import { useStorageContext } from '@/hooks/useStorageContext';

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isGenerating: boolean;
  isFavorite: boolean;
  gradient: string[];
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onShare?: () => void;
  onHideStyle: (styleId: string) => void;
  onHideTone: (toneId: string) => void;
  disabled?: boolean;
}

export function ModernQuestionCard({
  question,
  isGenerating,
  isFavorite,
  gradient,
  onToggleFavorite,
  onToggleHidden,
  onHideStyle,
  onHideTone,
  disabled = false,
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const style = useQuery(api.styles.getStyle, (!question || question?.style === "") ? "skip" : { id: question?.style as string ?? "would-you-rather" });
  const tone = useQuery(api.tones.getTone, (!question || question?.tone === "") ? "skip" : { id: question?.tone as string ?? "fun-silly" });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);
 
  const handleHideStyle = (itemId: string) => {
    if (!style) return;
    if (!itemId) return;
    if (itemId !== style.id) {
      console.log("Item ID does not match style ID", itemId, style.id);
      return;
    }
    onHideStyle(style.id);
    setIsDrawerOpen(false);
  };
  const handleHideTone = (itemId: string) => {
    if (!tone) return;
    if (!itemId) return;
    if (itemId !== tone.id) {
      console.log("Item ID does not match tone ID", itemId, tone.id);
      return;
    }
    if (!tone) return;
    onHideTone(tone.id);
    setIsDrawerOpen(false);
  };
  const handleHideItem = (itemId: string, itemType: "Style" | "Tone") => {
    if (!itemId) return;
    if (itemType === "Style") {
      handleHideStyle(itemId);
    } else {
      handleHideTone(itemId);
    }
  };
  const handleOpenStyleDrawer = () => {
    if (!style) return;
    setSelectedItemForDrawer({
      id: style.id,
      name: style.name,
      type: "Style",
      description: style.description || "",
      icon: style.icon as Icon,
      color: style.color,
    });
    setIsDrawerOpen(true);
  };
  const handleOpenToneDrawer = () => {
    if (!tone) return;
    setSelectedItemForDrawer({
      id: tone.id,
      name: tone.name,
      type: "Tone",
      description: tone.description || "",
      icon: tone.icon as Icon,
      color: tone.color,
    });
    setIsDrawerOpen(true);
  };
  const handleShare = async () => {
    if (!question || !navigator.share) return;

    const shareUrl = `${window.location.origin}/question/${question._id}`;

    try {
      await navigator.share({
        title: 'Ice Breaker Question',
        text: question.text,
        url: shareUrl,
      });
    } catch (error) {
      // User cancelled the share dialog or an error occurred
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
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
        <div className="w-full h-full min-h-[300px] bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col justify-center items-center">
          {isGenerating && !question ? (
            // Loading Spinner
            <LoadingSpinner gradient={gradient} />
          ) : (
            // Full Card Content
            question && 
            <>
              <QuestionContent 
                question={question} 
                style={style} 
                tone={tone} 
                gradient={gradient} 
                isFavorite={isFavorite} 
                onToggleFavorite={onToggleFavorite} 
                onToggleHidden={onToggleHidden} 
                disabled={disabled} 
                handleShare={() => void handleShare()} 
                onClickStyle={handleOpenStyleDrawer} 
                onClickTone={handleOpenToneDrawer}
              />
              <ItemDetailDrawer
                item={selectedItemForDrawer}
                isOpen={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                onHideItem={handleHideItem}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const LoadingSpinner = ({ gradient }: { gradient: string[] }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 min-h-[300px]">
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
  );
};

const QuestionContent = ({ question, style, tone, gradient, isFavorite, onToggleFavorite, onToggleHidden, disabled, handleShare, onClickStyle, onClickTone }: { question: Doc<"questions">, style?: Doc<"styles">, tone?: Doc<"tones">, gradient: string[], isFavorite: boolean, onToggleFavorite: () => void, onToggleHidden: () => void, disabled: boolean, handleShare: () => void, onClickStyle?: () => void, onClickTone?: () => void }) => {
  const handleClickStyle = () => {
    onClickStyle?.();
  };
  const handleClickTone = () => {
    onClickTone?.();
  };

  return (
    <div className="w-full h-full flex flex-col justify-between min-h-[300px]">
      {/* Category Badge */}
      <div className="flex flex-row gap-2 justify-between">
        <div className="border-t-2 border-l-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between"
          style={{
            borderTopColor: gradient[0],
            borderLeftColor: gradient[0]
          }}
        >
          <div 
            title={style && style.name}
            className="cursor-pointer flex gap-2 items-center text-sm font-semibold text-gray-800 dark:text-gray-200"
            onClick={handleClickStyle}
          >
            {style && <IconComponent icon={style.icon as Icon} size={24} color={style.color} />}
            <span className="hidden md:block">
              {style && style.name}
            </span>
            {!style && question.style}
          </div>
        </div>

        <div className="border-b-2 border-r-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between"
          style={{
            borderBottomColor: gradient[1],
            borderRightColor: gradient[1]
          }}
        >
          <div
            title={tone && tone.name}
            className="cursor-pointer flex gap-2 items-center text-sm font-semibold text-gray-800 dark:text-gray-200"
            onClick={handleClickTone}
          >
            {tone && <IconComponent icon={tone.icon as Icon} size={24} color={tone.color} />}
            <span className="hidden md:block">
              {tone && tone.name}
            </span>
            {!tone && question.tone}
          </div>
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
          disabled={disabled}
          className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
          title="Toggle favorite"
        >
          <Heart
            size={24}
            className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-400'}
          />
        </button>

        <button
          onClick={onToggleHidden}
          disabled={disabled}
          className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
          title="Hide question"
        >
          <ThumbsDown
            size={24}
            className='text-gray-600 dark:text-gray-400'
          />
        </button>

        {typeof navigator.share === 'function' && (
          <button
            onClick={handleShare}
            disabled={disabled}
            className="bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
            title="Share question"
          >
            <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}
      </div>
    </div>
  );
};
