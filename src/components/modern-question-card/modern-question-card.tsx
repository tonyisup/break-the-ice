import { useEffect, useRef, useState } from 'react';
import { Heart, Share2, ThumbsDown, TrashIcon } from '@/components/ui/icons/icons';
import { Sparkles } from 'lucide-react';
import { Doc, Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { useQuery, useConvexAuth } from 'convex/react';
import { Icon, IconComponent } from '../ui/icons/icon';
import type { ItemDetails } from '../item-detail-drawer/item-detail-drawer';
import { ItemDetailFace } from './item-detail-face';
import { RemixQuestionDrawer } from '../remix-question-drawer/remix-question-drawer';
import { useStorageContext } from '@/hooks/useStorageContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  onRemixed?: (originalQuestion: Doc<"questions">, newQuestion: Doc<"questions">) => void;
  topic?: any;
  onAnchorItem?: (item: ItemDetails) => void;
  anchoredStyleId?: Id<"styles"> | null;
  anchoredToneId?: Id<"tones"> | null;
  anchoredTopicId?: Id<"topics"> | null;
  /** When provided, used for the question image and getQuestionImageUrl is not called. */
  imageUrl?: string | null;
  /** When provided, renders a delete button on the card. */
  onDelete?: () => void;
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
  disabled = false,
  onRemixed,
  topic,
  onAnchorItem,
  anchoredStyleId,
  anchoredToneId,
  anchoredTopicId,
  imageUrl,
  onDelete,
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [detailItem, setDetailItem] = useState<ItemDetails | null>(null);
  // The chip that turned the card over, so focus can go back to it.
  const flipTriggerRef = useRef<HTMLElement | null>(null);
  const [isRemixDrawerOpen, setIsRemixDrawerOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();

  const showDetails = (item: ItemDetails) => {
    const active = document.activeElement;
    flipTriggerRef.current =
      active instanceof HTMLElement && cardRef.current?.contains(active) ? active : null;
    setDetailItem(item);
    setIsFlipped(true);
  };
  const flipBack = () => setIsFlipped(false);

  // Focus can only return once the front is interactive again, so do it after the render.
  useEffect(() => {
    if (!isFlipped && flipTriggerRef.current) {
      flipTriggerRef.current.focus({ preventScroll: true });
      flipTriggerRef.current = null;
    }
  }, [isFlipped]);

  // A new question always starts face-up.
  useEffect(() => {
    setIsFlipped(false);
  }, [question?._id]);

  const handleHideStyle = (itemId: Id<"styles">) => {
    if (!style) return;
    if (!itemId) return;
    if (itemId !== style._id) {
      console.log("Item ID does not match style ID", itemId, style._id);
      return;
    }
    onHideStyle(style._id);
    flipBack();
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
    flipBack();
  };
  const handleHideItem = (item: ItemDetails) => {
    if (!item) return;
    if (item.type === "Style") {
      handleHideStyle(item.id as Id<"styles">);
    } else {
      handleHideTone(item.id as Id<"tones">);
    }
  };

  const handleShowStyleDetails = () => {
    if (!style) return;
    showDetails({
      id: style._id,
      slug: style.id,
      name: style.name,
      type: "Style",
      description: style.description || "",
      icon: style.icon as Icon,
      color: style.color,
    });
  };
  const handleShowTopicDetails = () => {
    if (!topic) return;
    showDetails({
      id: topic._id,
      slug: topic.id,
      name: topic.name,
      type: "Topic",
      description: topic.description || "",
      icon: (topic.icon || "CircleHelp") as Icon,
      color: topic.color || "#888",
    });
  };
  const handleShowToneDetails = () => {
    if (!tone) return;
    showDetails({
      id: tone._id,
      slug: tone.id,
      name: tone.name,
      type: "Tone",
      description: tone.description || "",
      icon: tone.icon as Icon,
      color: tone.color,
    });
  };
  const handleShare = async () => {
    if (!question) return;

    const shareUrl = `${window.location.origin}/question/${question._id}`;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: 'Ice Breaker Question', text: question.text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Question link copied");
      }
    } catch (error) {
      // User cancelled the share dialog or an error occurred
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sharing:', error);
        toast.error("Couldn’t share the question. Please try again.");
      }
    }
  };

  const isAnchored =
    detailItem?.type === "Style" ? anchoredStyleId === detailItem.id :
    detailItem?.type === "Tone" ? anchoredToneId === detailItem.id :
    detailItem?.type === "Topic" ? anchoredTopicId === detailItem.id :
    false;
  const handleAnchor = onAnchorItem
    ? (item: ItemDetails) => {
        onAnchorItem(item);
        flipBack();
      }
    : undefined;
  const showBack = isFlipped && !!question && !!detailItem;

  return (
    <div
      key={question?._id}
      ref={cardRef}
      className="w-full max-w-md mx-auto [perspective:1200px]"
    >
      <div
        className={cn(
          "grid w-full h-full [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          showBack && "[transform:rotateY(180deg)]"
        )}
      >
        {/* Front: the question */}
        <div
          inert={showBack}
          className="[grid-area:1/1] w-full h-full rounded-[30px] p-[3px] [backface-visibility:hidden]"
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
                  onClickStyle={handleShowStyleDetails}
                  onClickTone={handleShowToneDetails}
                  onClickTopic={handleShowTopicDetails}
                  onRemix={isAuthenticated ? () => setIsRemixDrawerOpen(true) : undefined}
                  topic={topic}
                  imageUrl={imageUrl}
                  onDelete={onDelete}
                />
                {isAuthenticated && style && tone && (
                  <RemixQuestionDrawer
                    question={question}
                    styleId={style._id}
                    toneId={tone._id}
                    isOpen={isRemixDrawerOpen}
                    onOpenChange={setIsRemixDrawerOpen}
                    onRemixed={onRemixed}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Back: what the tapped style, tone or topic means. Both faces share one grid
            cell, so the card is as tall as the taller face and neither side scrolls. */}
        {question && detailItem && (
          <div
            inert={!showBack}
            className="[grid-area:1/1] rounded-[30px] p-[3px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{
              background: `linear-gradient(135deg, ${detailItem.color}, ${gradient[1]})`
            }}
          >
            <div className="h-full w-full rounded-[27px] bg-white dark:bg-gray-900">
              <ItemDetailFace
                item={detailItem}
                isActive={showBack}
                isAnchored={isAnchored}
                onBack={flipBack}
                onAnchor={handleAnchor}
                onHide={handleHideItem}
              />
            </div>
          </div>
        )}
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

interface QuestionContentProps {
  question: Doc<"questions">;
  style?: Doc<"styles"> | null;
  tone?: Doc<"tones"> | null;
  gradient: string[];
  isFavorite: boolean;
  isHidden: boolean;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  disabled: boolean;
  handleShare: () => void;
  onClickStyle?: () => void;
  onClickTone?: () => void;
  onClickTopic?: () => void;
  onRemix?: () => void;
  topic?: any;
  /** When provided, used for the question image and getQuestionImageUrl is not called. */
  imageUrl?: string | null;
  onDelete?: () => void;
}

const QuestionContent = ({
  question,
  style,
  tone,
  gradient,
  isFavorite,
  isHidden,
  onToggleFavorite,
  onToggleHidden,
  disabled,
  handleShare,
  onClickStyle,
  onClickTone,
  onClickTopic,
  onRemix,
  topic: providedTopic,
  imageUrl,
  onDelete,
}: QuestionContentProps) => {
  const { likedQuestions, likedLimit, storageLimitBehavior, hiddenQuestions, hiddenLimit } = useStorageContext();
  const [shakeHeart, setShakeHeart] = useState(false);
  const [shakeThumbsDown, setShakeThumbsDown] = useState(false);
  const fetchedTopic = useQuery(api.core.topics.getTopicById, (!providedTopic && question?.topicId) ? { id: question.topicId } : "skip");
  const questionImageUrlFromQuery = useQuery(
    api.core.questions.getQuestionImageUrl,
    (imageUrl === undefined || imageUrl === null) && question?._id && question?.imageStorageId ? { questionId: question._id } : "skip"
  );
  const questionImageUrl = imageUrl ?? questionImageUrlFromQuery ?? null;
  const topic = providedTopic || fetchedTopic;
  const safeIcon = (topic?.icon ? topic.icon : "CircleHelp") as Icon;

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

  const styleSlug =
    typeof question.style === "string" ? question.style.trim() : "";
  const toneSlug =
    typeof question.tone === "string" ? question.tone.trim() : "";
  const hasStyle = !!style || styleSlug.length > 0;
  const hasTone = !!tone || toneSlug.length > 0;

  return (
    <div className="w-full h-full flex flex-col justify-between min-h-[300px]">
      {/* Category Badge */}
      {(hasStyle || hasTone) && (
        <div className="flex flex-wrap gap-2 justify-between">
          {hasStyle && (
            <div className="border-t-2 border-l-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-start flex flex-row gap-2 justify-between"
              style={{
                borderTopColor: gradient[0],
                borderLeftColor: gradient[0]
              }}
            >
              <button
                type="button"
                aria-label={`Style: ${style?.name || styleSlug}`}
                title={style?.name || styleSlug || "style"}
                className="group cursor-pointer flex gap-2 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200"
                onClick={handleClickStyle}
              >
                {style && <IconComponent icon={style.icon as Icon} size={24} color={style.color} />}
                <span className="-ml-2 max-w-0 opacity-0 overflow-hidden whitespace-nowrap text-left transition-all duration-300 ease-out motion-reduce:transition-none group-hover:ml-0 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:ml-0 group-focus-visible:max-w-48 group-focus-visible:opacity-100">
                  {style?.name}
                </span>
                {!style && styleSlug}
              </button>
            </div>
          )}
        </div>
      )}

{topic && (
        <button
          type="button"
          className="w-full py-4 flex flex-row gap-2 justify-center items-center cursor-pointer bg-transparent border-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 rounded-lg"
          onClick={onClickTopic}
          aria-label={`Topic: ${topic.name}`}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Topic: {topic.name}
          </p>
          <span aria-hidden="true">
            <IconComponent icon={safeIcon} size={24} color={topic.color} />
          </span>
        </button>
      )}

      {/* Question Image */}
      {questionImageUrl && (<div className="w-full h-full flex items-center justify-center min-h-[120px]">
        <img src={questionImageUrl} alt="Question" className="max-w-full max-h-full object-contain mt-8" />
      </div>)}

      {/* Question Text */}
      <div className="flex-1 flex items-center justify-center text-center">
        <h2 className={cn(questionImageUrl ? "text-xl" : "text-2xl","font-bold text-gray-900 dark:text-white leading-relaxed")}>
          {question.text ?? question.customText}
        </h2>
      </div>

      
      {/* Action Buttons */}
      <div className="flex py-8 flex-wrap items-stretch justify-center gap-2 sm:gap-3">
        <button
          onClick={handleLike}
          disabled={disabled}
          title="Toggle favorite"
          className={cn(
            "p-4",
            shakeHeart && "motion-safe:animate-shake"
          )}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
        >
          <Heart
            size={24}
            className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-400'}
          />
          <span className="text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 sm:hidden">
            Favorite
          </span>
        </button>

        <button
          onClick={handleHide}
          disabled={disabled}
          className={cn(
            "p-4",
            shakeThumbsDown && "motion-safe:animate-shake"
          )}
          title={isHidden ? "Unhide question" : "Hide question"}
          aria-label={isHidden ? "Unhide question" : "Hide question"}
          aria-pressed={isHidden}
        >
          <ThumbsDown
            size={24}
            className={isHidden ? 'text-blue-500 fill-blue-500' : 'text-gray-600 dark:text-gray-400'}
          />
          <span className="text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 sm:hidden">
            {isHidden ? "Unhide" : "Hide"}
          </span>
        </button>

        {(
          <button
            onClick={handleShare}
            type="button"
            disabled={disabled}
            title="Share question"
            aria-label="Share question"
            className="p-4"
          >
            <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
            <span className="text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 sm:hidden">
              Share
            </span>
          </button>
        )}

        {onRemix && style && tone && (
          <button
            type="button"
            onClick={onRemix}
            disabled={disabled}
            className="p-4"
            title="Remix question"
          >
            <Sparkles size={24} className="text-gray-600 dark:text-gray-400" />
            <span className="text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 sm:hidden">
              Remix
            </span>
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="flex min-w-[72px] flex-col items-center justify-center gap-1 rounded-full bg-black/10 p-3 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-red-500/20"
            title="Delete question"
          >
            <TrashIcon size={24} className="text-gray-600 dark:text-gray-400 hover:text-red-500" />
            <span className="text-[10px] font-medium leading-none text-gray-600 dark:text-gray-400 sm:hidden">
              Delete
            </span>
          </button>
        )}
      </div>


{hasTone && (
            <div className="border-b-2 border-r-2 bg-black/10 dark:bg-white/10 px-4 py-2 rounded-full self-end flex flex-row gap-2 justify-between"
              style={{
                borderBottomColor: gradient[1],
                borderRightColor: gradient[1]
              }}
            >
              <button
                type="button"
                aria-label={`Tone: ${tone?.name || toneSlug}`}
                title={tone?.name || toneSlug || "tone"}
                className="group cursor-pointer flex gap-2 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200"
                onClick={handleClickTone}
              >
                {tone && <IconComponent icon={tone.icon as Icon} size={24} color={tone.color} />}
                <span className="-ml-2 max-w-0 opacity-0 overflow-hidden whitespace-nowrap text-left transition-all duration-300 ease-out motion-reduce:transition-none group-hover:ml-0 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:ml-0 group-focus-visible:max-w-48 group-focus-visible:opacity-100">
                  {tone?.name}
                </span>
                {!tone && toneSlug}
              </button>
            </div>
          )}
    </div>
  );
};
