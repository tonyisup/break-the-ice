import { useEffect, useRef, useState } from 'react';
import { Heart, Share2, ThumbsDown, TrashIcon } from '@/components/ui/icons/icons';
import { Info, Sparkles } from 'lucide-react';
import { Doc, Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { useQuery, useConvexAuth } from 'convex/react';
import { Icon, IconComponent } from '../ui/icons/icon';
import type { ItemDetails } from '../item-detail-drawer/item-detail-drawer';
import { ItemDetailFace } from './item-detail-face';
import { RemixQuestionPanel } from '../remix-question-panel/remix-question-panel';
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
  /** Leave out where hiding makes no sense, such as a person's own questions. */
  onToggleHidden?: () => void;
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
  // What the back of the card is showing: a style, tone or topic, or the remix panel.
  const [backMode, setBackMode] = useState<"detail" | "remix">("detail");
  const { isAuthenticated } = useConvexAuth();
  const canRemix = isAuthenticated && !!style && !!tone;

  const rememberFlipTrigger = () => {
    const active = document.activeElement;
    flipTriggerRef.current =
      active instanceof HTMLElement && cardRef.current?.contains(active) ? active : null;
  };
  const showDetails = (item: ItemDetails) => {
    rememberFlipTrigger();
    setDetailItem(item);
    setBackMode("detail");
    setIsFlipped(true);
  };
  const showRemix = () => {
    rememberFlipTrigger();
    setBackMode("remix");
    setIsFlipped(true);
  };
  const flipBack = () => setIsFlipped(false);
  const requestSignInToRemix = () => {
    // Clerk's global is there once it has loaded; without it the toast still says what to do.
    const clerk = (window as { Clerk?: { openSignIn?: () => void } }).Clerk;
    toast.info("Sign in to remix this question into your own.");
    clerk?.openSignIn?.();
  };

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
        await navigator.share({ title: 'Ice Breaker Question', text: question.text ?? question.customText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Question link copied");
      }
    } catch (error) {
      // User cancelled the share dialog or an error occurred
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sharing:', error);
        // Sharing failed for a reason other than the person cancelling: copy the link instead.
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast.success("Sharing didn't work, so the link was copied instead");
        } catch {
          toast.error("Couldn’t share the question. Copy this link instead:", { description: shareUrl, duration: 15000 });
        }
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
  const showBack = isFlipped && !!question && (backMode === "remix" ? canRemix : !!detailItem);

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
                  // Guests see Remix too; tapping it asks them to sign in.
                  onRemix={canRemix ? showRemix : !isAuthenticated && style && tone ? requestSignInToRemix : undefined}
                  topic={topic}
                  imageUrl={imageUrl}
                  onDelete={onDelete}
                />
              </>
            )}
          </div>
        </div>

        {/* Back: what the tapped style, tone or topic means, or the remix panel. Both faces
            share one grid cell, so the card is as tall as the taller face and neither side scrolls. */}
        {question && (detailItem || canRemix) && (
          <div
            inert={!showBack}
            className="[grid-area:1/1] rounded-[30px] p-[3px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{
              background: `linear-gradient(135deg, ${backMode === "detail" && detailItem ? detailItem.color : gradient[0]}, ${gradient[1]})`
            }}
          >
            <div className="h-full w-full rounded-[27px] bg-white dark:bg-gray-900">
              {backMode === "remix" && canRemix && style && tone ? (
                <RemixQuestionPanel
                  question={question}
                  styleId={style._id}
                  toneId={tone._id}
                  isOpen={showBack}
                  // The panel only asks to close once nothing unsaved would be lost.
                  onOpenChange={(open) => { if (!open) flipBack(); }}
                  onRemixed={onRemixed}
                />
              ) : detailItem && (
                <ItemDetailFace
                  item={detailItem}
                  isActive={showBack}
                  isAnchored={isAnchored}
                  onBack={flipBack}
                  onAnchor={handleAnchor}
                  onHide={handleHideItem}
                />
              )}
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
  /** Leave out where hiding makes no sense, such as a person's own questions. */
  onToggleHidden?: () => void;
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
        toast.info(`You've reached the limit of ${likedLimit} liked questions. Sign in to like more, or remove some first.`);
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
        toast.info(`You've reached the limit of ${hiddenLimit} hidden questions. Sign in to hide more, or unhide some in Settings.`);
        return;
      }
    }
    onToggleHidden?.();
  };

  // A private question, or one still waiting for review, opens only for its author, so a
  // shared link would show everyone else "Question not found".
  const isShareable = question.status !== "private" && question.status !== "pending";

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
                className="group -my-2 min-h-11 cursor-pointer flex gap-2 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200"
                onClick={handleClickStyle}
              >
                {style && <IconComponent icon={style.icon as Icon} size={24} color={style.color} />}
                <span className="max-w-40 truncate text-left">
                  {style?.name}
                </span>
                {!style && styleSlug}
                {/* A small cue that the pill opens what this style means. */}
                <Info size={14} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </div>
          )}
        </div>
      )}

{topic && (
        <button
          type="button"
          className="w-full min-h-11 py-2 flex flex-row gap-2 justify-center items-center cursor-pointer bg-transparent border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 rounded-lg"
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
      <div className="flex py-8 flex-wrap items-stretch justify-center gap-1.5 sm:gap-3">
        <button
          onClick={handleLike}
          disabled={disabled}
          title={isFavorite ? "Unlike question" : "Like question"}
          className={cn(
            "flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl p-3 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:hover:bg-white/10",
            shakeHeart && "motion-safe:animate-shake"
          )}
          aria-label={isFavorite ? "Unlike question" : "Like question"}
          aria-pressed={isFavorite}
        >
          <Heart
            size={24}
            className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-400'}
          />
          <span className="text-[11px] font-medium leading-none text-gray-600 dark:text-gray-400">
            {isFavorite ? "Liked" : "Like"}
          </span>
        </button>

        {onToggleHidden && <button
          onClick={handleHide}
          disabled={disabled}
          className={cn(
            "flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl p-3 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:hover:bg-white/10",
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
          <span className="text-[11px] font-medium leading-none text-gray-600 dark:text-gray-400">
            {isHidden ? "Unhide" : "Hide"}
          </span>
        </button>}

        {isShareable ? (
          <button
            onClick={handleShare}
            type="button"
            disabled={disabled}
            title="Share question"
            aria-label="Share question"
            className="flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl p-3 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:hover:bg-white/10"
          >
            <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
            <span className="text-[11px] font-medium leading-none text-gray-600 dark:text-gray-400">
              Share
            </span>
          </button>
        ) : (
          <p className="flex min-h-11 max-w-[9rem] items-center text-center text-[11px] leading-tight text-gray-600 dark:text-gray-400">
            Only you can open this, so it can't be shared yet
          </p>
        )}

        {onRemix && style && tone && (
          <button
            type="button"
            onClick={onRemix}
            disabled={disabled}
            className="flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl p-3 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:hover:bg-white/10"
            title="Remix question"
            aria-label="Remix question"
          >
            <Sparkles size={24} className="text-gray-600 dark:text-gray-400" />
            <span className="text-[11px] font-medium leading-none text-gray-600 dark:text-gray-400">
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
            aria-label="Delete question"
          >
            <TrashIcon size={24} className="text-gray-600 dark:text-gray-400 hover:text-red-500" />
            <span className="text-[11px] font-medium leading-none text-gray-600 dark:text-gray-400">
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
                className="group -my-2 min-h-11 cursor-pointer flex gap-2 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200"
                onClick={handleClickTone}
              >
                {tone && <IconComponent icon={tone.icon as Icon} size={24} color={tone.color} />}
                <span className="max-w-40 truncate text-left">
                  {tone?.name}
                </span>
                {!tone && toneSlug}
                <Info size={14} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </div>
          )}
    </div>
  );
};
