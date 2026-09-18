import { useState } from "react";
import { Heart, Share2, ThumbsDown, TrashIcon } from "@/components/ui/icons/icons";
import { PencilLine } from "lucide-react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { useQuery, useConvexAuth } from "convex/react";
import { Icon, IconComponent } from "../ui/icons/icon";
import { ItemDetailDrawer, ItemDetails } from "../item-detail-drawer/item-detail-drawer";
import { RemixQuestionDrawer } from "../remix-question-drawer/remix-question-drawer";
import { useStorageContext } from "@/hooks/useStorageContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ModernQuestionCardProps {
  question: Doc<"questions"> | null;
  isGenerating: boolean;
  isFavorite: boolean;
  isHidden?: boolean;
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
  topic?: Doc<"topics"> | null;
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
  question, isGenerating, isFavorite, isHidden = false, style, tone,
  onToggleFavorite, onToggleHidden, onShare, onHideStyle, onHideTone,
  onSelectedStylesChange, onSelectedTonesChange, selectedStyles, selectedTones,
  disabled = false, onRemixed, topic: providedTopic, onAnchorItem,
  anchoredStyleId, anchoredToneId, anchoredTopicId, imageUrl, onDelete,
}: ModernQuestionCardProps) {
  const [selectedItem, setSelectedItem] = useState<ItemDetails | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRemixOpen, setIsRemixOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const { likedQuestions, likedLimit, hiddenQuestions, hiddenLimit, storageLimitBehavior } = useStorageContext();
  const fetchedTopic = useQuery(api.core.topics.getTopicById,
    !providedTopic && question?.topicId ? { id: question.topicId } : "skip");
  const fetchedImage = useQuery(api.core.questions.getQuestionImageUrl,
    imageUrl === undefined && question?.imageStorageId ? { questionId: question._id } : "skip");
  const topic = providedTopic ?? fetchedTopic;
  const questionImage = imageUrl ?? fetchedImage;

  const openItem = (type: ItemDetails["type"], item: Doc<"styles"> | Doc<"tones"> | Doc<"topics">) => {
    setSelectedItem({ id: item._id, slug: item.slug ?? item.id, name: item.name, type,
      description: item.description ?? "", icon: (item.icon || "CircleHelp") as Icon, color: item.color || "#666666" });
    setIsDrawerOpen(true);
  };
  const hideItem = (item: ItemDetails) => {
    if (item.type === "Style" && style && item.id === style._id) onHideStyle(style._id);
    if (item.type === "Tone" && tone && item.id === tone._id) onHideTone(tone._id);
    setIsDrawerOpen(false);
  };
  const addFilter = (item: ItemDetails) => {
    if (item.type === "Style" && onSelectedStylesChange && selectedStyles) {
      onSelectedStylesChange([...new Set([...selectedStyles, item.slug])]);
    } else if (item.type === "Tone" && onSelectedTonesChange && selectedTones) {
      onSelectedTonesChange([...new Set([...selectedTones, item.slug])]);
    }
  };
  const toggleFavorite = () => {
    if (!isFavorite && likedQuestions.length >= likedLimit && storageLimitBehavior === "block") {
      toast.error("Your saved-question limit is full. Remove a saved question to make room.");
      return;
    }
    onToggleFavorite();
  };
  const toggleHidden = () => {
    if (!isHidden && hiddenQuestions.length >= hiddenLimit && storageLimitBehavior === "block") {
      toast.error("Your hidden-question limit is full. Manage hidden questions in Settings.");
      return;
    }
    onToggleHidden();
  };
  const share = async () => {
    if (!question) return;
    if (onShare) { onShare(); return; }
    const url = `${window.location.origin}/question/${question._id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Break the Ice", text: question.text ?? question.customText, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Question link copied");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) toast.error("Couldn't share this question. Try again.");
    }
  };
  const isAnchored = selectedItem?.type === "Style" ? anchoredStyleId === selectedItem.id
    : selectedItem?.type === "Tone" ? anchoredToneId === selectedItem.id
    : selectedItem?.type === "Topic" ? anchoredTopicId === selectedItem.id : false;

  return (
    <article className="question-card" aria-busy={isGenerating}>
      {isGenerating && !question ? (
        <p role="status" className="py-16 text-center text-muted-foreground">Finding a question…</p>
      ) : question ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(style || question.style) && (
              <Button type="button" variant="secondary" disabled={disabled || !style}
                aria-label={`Style: ${style?.name || question.style}`} onClick={() => style && openItem("Style", style)}
                className="h-auto min-h-11 max-w-full whitespace-normal text-left text-xs">
                {style && <IconComponent icon={style.icon as Icon} size={16} />}
                {style?.name || question.style}
              </Button>
            )}
            {(tone || question.tone) && (
              <Button type="button" variant="secondary" disabled={disabled || !tone}
                aria-label={`Tone: ${tone?.name || question.tone}`} onClick={() => tone && openItem("Tone", tone)}
                className="h-auto min-h-11 max-w-full whitespace-normal text-left text-xs">
                {tone && <IconComponent icon={tone.icon as Icon} size={16} />}
                {tone?.name || question.tone}
              </Button>
            )}
          </div>
          {questionImage && <img src={questionImage} alt="Illustration accompanying this question" loading="lazy" className="mt-6 max-h-72 w-full rounded-lg object-contain" />}
          <h2 className="py-8 text-2xl font-bold leading-snug tracking-tight text-balance sm:text-3xl">{question.text ?? question.customText}</h2>
          <div className="flex flex-wrap gap-1 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={disabled} onClick={toggleFavorite} aria-pressed={isFavorite} className="min-h-11 text-xs">
              <Heart className={isFavorite ? "fill-current text-primary" : ""} aria-hidden="true" />{isFavorite ? "Saved" : "Save"}
            </Button>
            <Button type="button" variant="ghost" disabled={disabled} onClick={toggleHidden} aria-pressed={isHidden} className="min-h-11 text-xs">
              <ThumbsDown aria-hidden="true" />{isHidden ? "Unhide" : "Hide"}
            </Button>
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => void share()} className="min-h-11 text-xs">
              <Share2 aria-hidden="true" />Share
            </Button>
            {isAuthenticated && style && tone && (
              <Button type="button" variant="ghost" disabled={disabled} onClick={() => setIsRemixOpen(true)} className="min-h-11 text-xs">
                <PencilLine aria-hidden="true" />Remix
              </Button>
            )}
            {onDelete && <Button type="button" variant="ghost" disabled={disabled} onClick={onDelete} className="min-h-11 text-xs text-destructive"><TrashIcon aria-hidden="true" />Delete</Button>}
          </div>
          {topic && (
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => openItem("Topic", topic)} aria-label={`Topic: ${topic.name}`} className="mt-3 h-auto min-h-11 max-w-full justify-start whitespace-normal text-left text-xs text-muted-foreground">
              <IconComponent icon={(topic.icon || "CircleHelp") as Icon} size={16} />{topic.name}
            </Button>
          )}
          <ItemDetailDrawer item={selectedItem} isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}
            onHideItem={hideItem} onAddFilter={(selectedItem?.type === "Style" && onSelectedStylesChange && selectedStyles) || (selectedItem?.type === "Tone" && onSelectedTonesChange && selectedTones) ? addFilter : undefined} onAnchorItem={onAnchorItem} isAnchored={isAnchored} />
          {isAuthenticated && style && tone && (
            <RemixQuestionDrawer question={question} styleId={style._id} toneId={tone._id} isOpen={isRemixOpen} onOpenChange={setIsRemixOpen} onRemixed={onRemixed} />
          )}
        </>
      ) : null}
    </article>
  );
}
