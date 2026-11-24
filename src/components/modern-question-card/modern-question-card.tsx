import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Share2, ThumbsDown, TrashIcon } from "@/components/ui/icons/icons";
import { Lock, Sparkles } from "lucide-react";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useQuery, useConvexAuth } from "convex/react";
import { Icon, IconComponent } from "../ui/icons/icon";
import type { ItemDetails } from "../item-detail-drawer/item-detail-drawer";
import { CardBodyMorph } from "./card-body-morph";
import { ItemDetailFace } from "./item-detail-face";
import { RemixQuestionPanel } from "../remix-question-panel/remix-question-panel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStorageContext } from "@/hooks/useStorageContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  /** When set, the card morphs into this notice, keeping its border and accent edge. */
  hiddenNotice?: ReactNode;
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
  hiddenNotice,
}: ModernQuestionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [detailItem, setDetailItem] = useState<ItemDetails | null>(null);
  const [isRemixOpen, setIsRemixOpen] = useState(false);
  // The chip that turned the card over, so focus can go back to it.
  const flipTriggerRef = useRef<HTMLElement | null>(null);
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
    setIsFlipped(true);
  };
  const flipBack = () => setIsFlipped(false);
  const requestSignInToRemix = () => {
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

  // A new question always starts face-up with remix closed.
  useEffect(() => {
    setIsFlipped(false);
    setIsRemixOpen(false);
  }, [question?._id]);

  // The back face shares the card's grid cell, so it would hold the card open. CardBodyMorph's
  // layout effect runs first and has already read the full height by the time this clears it.
  const isShowingNotice = hiddenNotice !== undefined && hiddenNotice !== null;
  useLayoutEffect(() => {
    if (!isShowingNotice) return;
    setIsFlipped(false);
    setDetailItem(null);
  }, [isShowingNotice]);

  const handleHideStyle =(itemId: Id<"styles">) => {
    if (!style || !itemId || itemId !== style._id) return;
    onHideStyle(style._id);
    flipBack();
  };
  const handleHideTone = (itemId: Id<"tones">) => {
    if (!tone || !itemId || itemId !== tone._id) return;
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
      color: topic.color || "#0E7490",
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
        await navigator.share({
          title: "Break the Ice(berg)",
          text: question.text ?? question.customText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Question link copied");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error sharing:", error);
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast.success("Sharing didn't work, so the link was copied instead");
        } catch {
          toast.error("Couldn’t share the question. Copy this link instead:", {
            description: shareUrl,
            duration: 15000,
          });
        }
      }
    }
  };

  const isAnchored =
    detailItem?.type === "Style"
      ? anchoredStyleId === detailItem.id
      : detailItem?.type === "Tone"
        ? anchoredToneId === detailItem.id
        : detailItem?.type === "Topic"
          ? anchoredTopicId === detailItem.id
          : false;
  const handleAnchor = onAnchorItem
    ? (item: ItemDetails) => {
        onAnchorItem(item);
        flipBack();
      }
    : undefined;
  const showBack = isFlipped && !!question && !!detailItem;

  return (
    <>
      <div
        key={question?._id}
        ref={cardRef}
        className="w-full max-w-md mx-auto [perspective:1200px]"
      >
        <div
          className={cn(
            "grid w-full h-full [transform-style:preserve-3d] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            showBack && "[transform:rotateY(180deg)]",
          )}
        >
          {/* Front: Tactile playing-card face + dedicated footer action dock */}
          <div
            inert={showBack}
            className="[grid-area:1/1] deck-card flex w-full h-full flex-col overflow-hidden [backface-visibility:hidden]"
          >
            {/* Subtle two-tone card accent edge */}
            <div
              aria-hidden="true"
              className="h-1.5 w-full shrink-0"
              style={{
                background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
              }}
            />
            {isGenerating && !question ? (
              <LoadingSpinner gradient={gradient} />
            ) : (
              question && (
                <CardBodyMorph notice={hiddenNotice}>
                  <QuestionContent
                    question={question}
                    style={style}
                    tone={tone}
                    isFavorite={isFavorite}
                    isHidden={isHidden}
                    onToggleFavorite={onToggleFavorite}
                    onToggleHidden={onToggleHidden}
                    disabled={disabled}
                    handleShare={() => void handleShare()}
                    onClickStyle={handleShowStyleDetails}
                    onClickTone={handleShowToneDetails}
                    onClickTopic={handleShowTopicDetails}
                    onRemix={
                      canRemix
                        ? () => setIsRemixOpen(true)
                        : !isAuthenticated && style && tone
                          ? requestSignInToRemix
                          : undefined
                    }
                    topic={topic}
                    imageUrl={imageUrl}
                    onDelete={onDelete}
                  />
                </CardBodyMorph>
              )
            )}
          </div>

          {/* Back: Compact style / tone / topic detail face */}
          {question && detailItem && (
            <div
              inert={!showBack}
              className="[grid-area:1/1] deck-card overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]"
            >
              <ItemDetailFace
                item={detailItem}
                isActive={showBack}
                isAnchored={isAnchored}
                onBack={flipBack}
                onAnchor={handleAnchor}
                onHide={handleHideItem}
              />
            </div>
          )}
        </div>
      </div>

      {/* Remix opens in a dedicated modal so the card never stretches mid-flip */}
      {question && canRemix && style && tone && (
        <Dialog open={isRemixOpen} onOpenChange={setIsRemixOpen}>
          <DialogContent
            className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-3xl p-0 [&>button]:hidden"
            onEscapeKeyDown={(event) => {
              // Let RemixQuestionPanel guard unsaved drafts on Escape.
              event.preventDefault();
            }}
            onInteractOutside={(event) => {
              // Prevent accidentally losing an unsaved remix by tapping the backdrop.
              event.preventDefault();
            }}
          >
            <DialogTitle className="sr-only">Remix Question</DialogTitle>
            <RemixQuestionPanel
              question={question}
              styleId={style._id}
              toneId={tone._id}
              isOpen={isRemixOpen}
              onOpenChange={setIsRemixOpen}
              onRemixed={onRemixed}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const LoadingSpinner = ({ gradient }: { gradient: string[] }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 min-h-[320px] p-8">
      <div
        className="w-10 h-10 border-[3px] border-muted rounded-full animate-spin"
        style={{
          borderTopColor: gradient[0],
          borderBottomColor: gradient[1],
        }}
      />
      <p className="text-sm font-medium text-muted-foreground">
        Generating question…
      </p>
    </div>
  );
};

interface QuestionContentProps {
  question: Doc<"questions">;
  style?: Doc<"styles"> | null;
  tone?: Doc<"tones"> | null;
  isFavorite: boolean;
  isHidden: boolean;
  onToggleFavorite: () => void;
  onToggleHidden?: () => void;
  disabled: boolean;
  handleShare: () => void;
  onClickStyle?: () => void;
  onClickTone?: () => void;
  onClickTopic?: () => void;
  onRemix?: () => void;
  topic?: any;
  imageUrl?: string | null;
  onDelete?: () => void;
}

const QuestionContent = ({
  question,
  style,
  tone,
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
  const {
    likedQuestions,
    likedLimit,
    storageLimitBehavior,
    hiddenQuestions,
    hiddenLimit,
  } = useStorageContext();
  const [shakeHeart, setShakeHeart] = useState(false);
  const [shakeThumbsDown, setShakeThumbsDown] = useState(false);
  const fetchedTopic = useQuery(
    api.core.topics.getTopicById,
    !providedTopic && question?.topicId ? { id: question.topicId } : "skip",
  );
  const questionImageUrlFromQuery = useQuery(
    api.core.questions.getQuestionImageUrl,
    (imageUrl === undefined || imageUrl === null) &&
      question?._id &&
      question?.imageStorageId
      ? { questionId: question._id }
      : "skip",
  );
  const questionImageUrl = imageUrl ?? questionImageUrlFromQuery ?? null;
  const topic = providedTopic || fetchedTopic;
  const safeIcon = (topic?.icon ? topic.icon : "CircleHelp") as Icon;

  const handleLike = () => {
    if (!isFavorite && likedQuestions.length >= likedLimit) {
      setShakeHeart(true);
      setTimeout(() => setShakeHeart(false), 500);

      if (storageLimitBehavior === "block") {
        toast.info(
          `You've reached the limit of ${likedLimit} liked questions. Sign in to like more, or remove some first.`,
        );
        return;
      }
    }
    onToggleFavorite();
  };

  const handleHide = () => {
    if (!isHidden && hiddenQuestions.length >= hiddenLimit) {
      setShakeThumbsDown(true);
      setTimeout(() => setShakeThumbsDown(false), 500);

      if (storageLimitBehavior === "block") {
        toast.info(
          `You've reached the limit of ${hiddenLimit} hidden questions. Sign in to hide more, or unhide some in Settings.`,
        );
        return;
      }
    }
    onToggleHidden?.();
  };

  const isShareable = question.status !== "private" && question.status !== "pending";
  const styleSlug = typeof question.style === "string" ? question.style.trim() : "";
  const toneSlug = typeof question.tone === "string" ? question.tone.trim() : "";
  const hasStyle = !!style || styleSlug.length > 0;
  const hasTone = !!tone || toneSlug.length > 0;
  const questionText = question.text ?? question.customText ?? "";

  // Scale typography gently so short prompts feel bold and long ones breathe comfortably.
  const questionSizeClass = questionImageUrl
    ? "text-lg sm:text-xl"
    : questionText.length <= 75
      ? "text-2xl sm:text-[1.65rem]"
      : questionText.length <= 140
        ? "text-xl sm:text-[1.4rem]"
        : "text-lg sm:text-xl";

  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Playing-card face: diagonal corner indices + generous centered question stage */}
      <div className="flex flex-1 flex-col justify-between px-5 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5">
        {/* Top corner row: Style index (top-left) + optional private indicator (top-right) */}
        {(hasStyle || !isShareable) && (
          <div className="flex items-center justify-between gap-2">
            {hasStyle ? (
              <button
                type="button"
                aria-label={`Style: ${style?.name || styleSlug}`}
                title={style?.name || styleSlug || "Style"}
                onClick={() => onClickStyle?.()}
                className="inline-flex min-h-11 max-w-[75%] items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {style && (
                  <span aria-hidden="true" className="shrink-0">
                    <IconComponent icon={style.icon as Icon} size={16} color={style.color} />
                  </span>
                )}
                <span className="truncate">{style?.name || styleSlug}</span>
              </button>
            ) : (
              <span />
            )}

            {!isShareable && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                title="Only you can open this question, so it can't be shared yet"
              >
                <Lock className="size-3" aria-hidden="true" />
                {question.status === "pending" ? "In review" : "Private"}
              </span>
            )}
          </div>
        )}

        {/* Center stage: Topic eyebrow, optional image, and balanced question text */}
        <div className="flex flex-1 flex-col items-center justify-center px-2 py-7 text-center sm:px-4 sm:py-9 min-h-[180px]">
          {topic && (
            <button
              type="button"
              onClick={onClickTopic}
              aria-label={`Topic: ${topic.name}`}
              className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">
                <IconComponent icon={safeIcon} size={14} color={topic.color} />
              </span>
              <span>{topic.name}</span>
            </button>
          )}

          {questionImageUrl && (
            <div className="mb-5 flex w-full items-center justify-center">
              <img
                src={questionImageUrl}
                alt="Question illustration"
                className="max-h-52 max-w-full rounded-2xl object-contain"
              />
            </div>
          )}

          <h2
            className={cn(
              questionSizeClass,
              "font-bold tracking-[-0.02em] leading-[1.32] text-balance text-card-foreground",
            )}
          >
            {questionText}
          </h2>
        </div>

        {/* Bottom-right corner index: Tone (completes the diagonal playing-card symmetry) */}
        {hasTone && (
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={`Tone: ${tone?.name || toneSlug}`}
              title={tone?.name || toneSlug || "Tone"}
              onClick={() => onClickTone?.()}
              className="inline-flex min-h-11 max-w-[75%] items-center gap-2 rounded-full border border-border/80 bg-secondary/55 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tone && (
                <span aria-hidden="true" className="shrink-0">
                  <IconComponent icon={tone.icon as Icon} size={16} color={tone.color} />
                </span>
              )}
              <span className="truncate">{tone?.name || toneSlug}</span>
            </button>
          </div>
        )}
      </div>

      {/* Dedicated footer action dock: uniform buttons cleanly separated from the card face */}
      <div className="flex items-stretch justify-around gap-1 border-t border-border/70 bg-muted/35 px-2.5 py-2">
        <button
          type="button"
          onClick={handleLike}
          disabled={disabled}
          title={isFavorite ? "Unlike question" : "Like question"}
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            isFavorite ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:text-foreground",
            shakeHeart && "motion-safe:animate-shake",
          )}
          aria-label={isFavorite ? "Unlike question" : "Like question"}
          aria-pressed={isFavorite}
        >
          <Heart
            size={20}
            className={isFavorite ? "fill-current" : undefined}
          />
          <span className="text-[11px] font-semibold leading-none">
            {isFavorite ? "Liked" : "Like"}
          </span>
        </button>

        {onToggleHidden && (
          <button
            type="button"
            onClick={handleHide}
            disabled={disabled}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              isHidden ? "text-primary" : "text-muted-foreground hover:text-foreground",
              shakeThumbsDown && "motion-safe:animate-shake",
            )}
            title={isHidden ? "Unhide question" : "Hide question"}
            aria-label={isHidden ? "Unhide question" : "Hide question"}
            aria-pressed={isHidden}
          >
            <ThumbsDown
              size={20}
              className={isHidden ? "fill-current" : undefined}
            />
            <span className="text-[11px] font-semibold leading-none">
              {isHidden ? "Unhide" : "Hide"}
            </span>
          </button>
        )}

        {isShareable && (
          <button
            onClick={handleShare}
            type="button"
            disabled={disabled}
            title="Share question"
            aria-label="Share question"
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Share2 size={20} />
            <span className="text-[11px] font-semibold leading-none">Share</span>
          </button>
        )}

        {onRemix && style && tone && (
          <button
            type="button"
            onClick={onRemix}
            disabled={disabled}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            title="Remix question"
            aria-label="Remix question"
          >
            <Sparkles size={20} />
            <span className="text-[11px] font-semibold leading-none">Remix</span>
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            title="Delete question"
            aria-label="Delete question"
          >
            <TrashIcon size={20} />
            <span className="text-[11px] font-semibold leading-none">Delete</span>
          </button>
        )}
      </div>
    </div>
  );
};
