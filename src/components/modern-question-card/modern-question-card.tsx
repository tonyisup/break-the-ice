import React, { useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Heart, Share2, ThumbsDown } from '@/components/ui/icons/icons';
import { Doc, Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { Icon, IconComponent } from '../ui/icons/icon';
import { ItemDetailDrawer, ItemDetails } from '../item-detail-drawer/item-detail-drawer';
import { useStorageContext } from '@/hooks/useStorageContext';
import { cn } from '@/lib/utils';

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isGenerating: boolean;
  isFavorite: boolean;
  isHidden?: boolean;
  gradient: string[];
  style?: Doc<"styles"> | null;
  tone?: Doc<"tones"> | null;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onShare?: () => void;
  onHideStyle: (styleId: Id<"styles">) => void;
  onHideTone: (toneId: Id<"tones">) => void;
  onSelectedStylesChange?: (styles: string[]) => void;
  onSelectedTonesChange?: (tones: string[]) => void;
  selectedStyles?: string[];
  selectedTones?: string[];
  disabled?: boolean;
}

export function ModernQuestionCard({
  question,
  isGenerating,
  isFavorite,
  isHidden = false,
  gradient,
  style,
  tone,
  onToggleFavorite,
  onToggleHidden,
  onHideStyle,
  onHideTone,
  onSelectedStylesChange,
  onSelectedTonesChange,
  selectedStyles,
  selectedTones,
  disabled = false,
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<ItemDetails | null>(null);

  const handleHideStyle = (itemId: Id<"styles">) => {
    if (!style) return;
    if (!itemId) return;
    if (itemId !== style._id) {
      console.log("Item ID does not match style ID", itemId, style._id);
      return;
    }
    onHideStyle(style._id);
    setIsDrawerOpen(false);
  };
  const handleHideTone = (itemId: Id<"tones">) => {
    if (!tone) return;
    if (!itemId) return;
    if (itemId !== tone._id) {
      console.log("Item ID does not match tone ID", itemId, tone._id);
      return;
    }
    if (!tone) return;
    onHideTone(tone._id);
    setIsDrawerOpen(false);
  };
  const handleHideItem = (item: ItemDetails) => {
    if (!item) return;
    if (item.type === "Style") {
      handleHideStyle(item.id as Id<"styles">);
    } else {
      handleHideTone(item.id as Id<"tones">);
    }
  };

  const onAddFilter = (item: ItemDetails) => {
    if (item.type === "Style") {
      if (onSelectedStylesChange && selectedStyles) {
        onSelectedStylesChange([...selectedStyles, item.slug]);
      }
    } else {
      if (onSelectedTonesChange && selectedTones) {
        onSelectedTonesChange([...selectedTones, item.slug]);
      }
    }
  };
  const handleOpenStyleDrawer = () => {
    if (!style) return;
    setSelectedItemForDrawer({
      id: style._id,
      slug: style.id,
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
      id: tone._id,
      slug: tone.id,
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
                isHidden={isHidden}
                onToggleFavorite={onToggleFavorite}
                onToggleHidden={onToggleHidden}
                disabled={disabled}
                handleShare={() => void handleShare()}
                onClickStyle={handleOpenStyleDrawer}
                onClickTone={handleOpenToneDrawer}
                containerRef={cardRef}
              />
              <ItemDetailDrawer
                item={selectedItemForDrawer}
                isOpen={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                onHideItem={handleHideItem}
                onAddFilter={onAddFilter}
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

const QuestionContent = ({ question, style, tone, gradient, isFavorite, isHidden, onToggleFavorite, onToggleHidden, disabled, handleShare, onClickStyle, onClickTone, containerRef }: { question: Doc<"questions">, style?: Doc<"styles"> | null, tone?: Doc<"tones"> | null, gradient: string[], isFavorite: boolean, isHidden: boolean, onToggleFavorite: () => void, onToggleHidden: () => void, disabled: boolean, handleShare: () => void, onClickStyle?: () => void, onClickTone?: () => void, containerRef: React.RefObject<HTMLDivElement | null> }) => {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const baseRotate = useTransform(
    scrollYProgress,
    [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    [0, 25, -25, 25, -25, 25, -25, 25, -25, 25, 0]
  );

  const rotate = useSpring(baseRotate, {
    stiffness: 100,
    damping: 10,
    mass: 3
  });
  const { likedQuestions, likedLimit, storageLimitBehavior, hiddenQuestions, hiddenLimit } = useStorageContext();
  const [shakeHeart, setShakeHeart] = useState(false);
  const [shakeThumbsDown, setShakeThumbsDown] = useState(false);
  const topic = useQuery(api.core.topics.getTopicById, { id: question.topicId })

  const handleClickStyle = () => {
    onClickStyle?.(); 
  };
  const handleClickTone = () => {
    onClickTone?.();
  };

  const handleLike = () => {
    if (!isFavorite && likedQuestions.length >= likedLimit) {
      setShakeHeart(true);
      setTimeout(() => setShakeHeart(false), 500);

      if (storageLimitBehavior === 'block') {
        return;
      }
    }
    onToggleFavorite();
  };

  const handleHide = () => {
    // Check if current question is already hidden
    if (!isHidden && hiddenQuestions.length >= hiddenLimit) {
      setShakeThumbsDown(true);
      setTimeout(() => setShakeThumbsDown(false), 500);

      if (storageLimitBehavior === 'block') {
        return;
      }
    }
    onToggleHidden();
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
            title={style && style.name || "style"}
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
            title={tone && tone.name || "tone"}
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
          {question.text ?? question.customText}
        </h2>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center items-center gap-3">
        <button
          onClick={handleLike}
          disabled={disabled}
          className={cn(
            "bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50",
            shakeHeart && "animate-shake"
          )}
          title="Toggle favorite"
        >
          <Heart
            size={24}
            className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-400'}
          />
        </button>

        <button
          onClick={handleHide}
          disabled={disabled}
          className={cn(
            "bg-black/10 dark:bg-white/10 p-3 rounded-full hover:bg-black/20 dark:hover:bg-white/20 transition-colors disabled:opacity-50",
            shakeThumbsDown && "animate-shake"
          )}
          title={isHidden ? "Unhide question" : "Hide question"}
        >
          <ThumbsDown
            size={24}
            className={isHidden ? 'text-blue-500 fill-blue-500' : 'text-gray-600 dark:text-gray-400'}
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
      {topic && (
        <div className="mt-4 flex flex-row gap-2 justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Topic: {topic.name}
          </p>
          <motion.p 
            style={{ rotate }}
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            <IconComponent icon={topic.icon as Icon} size={24} />
          </motion.p>
        </div>
      )}
    </div>
  );
};
