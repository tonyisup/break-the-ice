import { useState, useMemo, useRef, useEffect, useId } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { convexErrorData } from "../../../convex/lib/errorData";
import { normalizeQuestionTags } from "../../../convex/lib/questionTags";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_QUESTION_TAG_LENGTH,
  MAX_QUESTION_TAGS,
  MAX_QUESTION_TEXT_LENGTH,
} from "../../../convex/constants";
import { api } from "../../../convex/_generated/api";
import { AI_USAGE_CYCLE_MS } from "../../../convex/lib/aiPlanLimits";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { PackOffer } from "@/components/PackOffer";

type RemixState = "idle" | "remixing" | "remixed";

interface RemixQuestionPanelProps {
  question: Doc<"questions">;
  styleId: Id<"styles">;
  toneId: Id<"tones">;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRemixed?: (
    originalQuestion: Doc<"questions">,
    newQuestion: Doc<"questions">,
  ) => void;
}

interface PickerOption {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

function TaxonomyPicker({
  id,
  label,
  options,
  selectedId,
  selectedItem,
  onSelect,
}: {
  id: string;
  label: string;
  options: PickerOption[] | undefined;
  selectedId: string | undefined;
  selectedItem: PickerOption | null | undefined;
  onSelect: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selectedItem?.icon && (
                <span aria-hidden="true" className="shrink-0">
                  <IconComponent
                    icon={selectedItem.icon as Icon}
                    size={16}
                    color={selectedItem.color}
                  />
                </span>
              )}
              <span className="truncate">
                {selectedItem ? selectedItem.name : "Current"}
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="max-h-64 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto rounded-2xl p-1.5"
        >
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                onClick={() => {
                  onSelect(undefined);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  !selectedId && "bg-accent font-semibold",
                )}
              >
                <span>Current</span>
                {!selectedId && <Check className="size-4 shrink-0" aria-hidden="true" />}
              </button>
            </li>
            {(options ?? []).map((option) => {
              const isSelected = option._id === selectedId;
              return (
                <li key={option._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(option._id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent",
                      isSelected && "bg-accent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center"
                    >
                      {option.icon && (
                        <IconComponent
                          icon={option.icon as Icon}
                          size={16}
                          color={option.color}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {option.name}
                      </span>
                      {option.description && (
                        <span className="block line-clamp-2 text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
      {selectedItem?.description && (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {selectedItem.description}
        </p>
      )}
    </div>
  );
}

/**
 * Remix a question into your own spin. Closing is refused while a remix is running or a
 * draft is unsaved, so `onOpenChange(false)` is only called once it is safe to close.
 */
export function RemixQuestionPanel({
  question,
  styleId,
  toneId,
  isOpen,
  onOpenChange,
  onRemixed,
}: RemixQuestionPanelProps) {
  const [remixState, setRemixState] = useState<RemixState>("idle");
  const [remixedText, setRemixedText] = useState("");
  const [newQuestionId, setNewQuestionId] = useState<Id<"questions"> | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [, setSaveFailed] = useState(false);
  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
  const [showTagList, setShowTagList] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const styles = useQuery(api.core.styles.getStyles, isOpen ? {} : "skip");
  const tones = useQuery(api.core.tones.getTones, isOpen ? {} : "skip");
  const allAvailableTags = useQuery(api.core.tags.getTags, isOpen ? {} : "skip");

  const filteredSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase();
    return (
      allAvailableTags
        ?.filter(
          (t) =>
            !tags.includes(t.name) &&
            (!query || t.name.toLowerCase().includes(query)),
        )
        .slice(0, 12) || []
    );
  }, [allAvailableTags, tagInput, tags]);

  const [selectedStyleId, setSelectedStyleId] = useState<Id<"styles"> | undefined>(
    styleId,
  );
  const [selectedToneId, setSelectedToneId] = useState<Id<"tones"> | undefined>(
    toneId,
  );

  const questionStyle = useQuery(
    api.core.styles.getStyleById,
    isOpen && styleId ? { id: styleId } : "skip",
  );
  const questionTone = useQuery(
    api.core.tones.getToneById,
    isOpen && toneId ? { id: toneId } : "skip",
  );
  const style = selectedStyleId
    ? styles?.find((s) => s._id === selectedStyleId) ?? questionStyle ?? null
    : questionStyle;
  const tone = selectedToneId
    ? tones?.find((t) => t._id === selectedToneId) ?? questionTone ?? null
    : questionTone;

  const currentUser = useQuery(api.core.users.getCurrentUser, isOpen ? {} : "skip");
  const remixQuestion = useAction(api.core.questions.remixQuestionForUser);
  const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);
  const updatePersonalQuestion = useMutation(api.core.questions.updatePersonalQuestion);
  const deletePersonalQuestion = useMutation(api.core.questions.deletePersonalQuestion);

  const headingId = useId();
  const styleSelectId = useId();
  const toneSelectId = useId();
  const tagInputId = useId();
  const remixedTextId = useId();
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const beforeConfirmRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const remixRequestIdRef = useRef(0);
  useEffect(
    () => () => {
      remixRequestIdRef.current += 1;
    },
    [],
  );

  const focusAfterCancelRef = useRef(false);
  const remixButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusAfterCancelRef.current || remixState === "remixing") return;
    focusAfterCancelRef.current = false;
    if (remixState === "remixed") {
      saveButtonRef.current?.focus();
    } else {
      const remixButton = remixButtonRef.current;
      (remixButton && !remixButton.disabled
        ? remixButton
        : closeButtonRef.current
      )?.focus();
    }
  }, [remixState]);

  const hasChanges = useMemo(() => {
    const styleChanged = selectedStyleId !== styleId;
    const toneChanged = selectedToneId !== toneId;
    const initialTags = question?.tags || [];
    const tagsChanged =
      tags.length !== initialTags.length ||
      !tags.every((t) => initialTags.includes(t)) ||
      !initialTags.every((t) => tags.includes(t));

    return remixState === "remixed" || styleChanged || toneChanged || tagsChanged;
  }, [remixState, selectedStyleId, styleId, selectedToneId, toneId, tags, question?.tags]);

  const handleOpenChange = (open: boolean) => {
    if (!open && (hasChanges || remixState === "remixing") && remixState !== "idle") {
      if (remixState === "remixing") {
        toast.warning("Please wait for the remix to finish or cancel it.", {
          id: "remix-in-progress",
        });
        return;
      }
      beforeConfirmRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConfirmingClose(true);
      return;
    }

    onOpenChange(open);
  };

  const forceClose = () => onOpenChange(false);

  const resetState = () => {
    remixRequestIdRef.current += 1;
    setRemixState("idle");
    setRemixedText("");
    setNewQuestionId(null);
    setIsPublic(false);
    setTagInput("");
    setTags([]);
    setSelectedStyleId(styleId);
    setSelectedToneId(toneId);
    setSaveFailed(false);
    setFocusedSuggestionIndex(-1);
    setShowTagList(false);
    setConfirmingClose(false);
  };

  useEffect(() => {
    if (confirmingClose) keepEditingRef.current?.focus();
  }, [confirmingClose]);

  const keepEditing = () => {
    setConfirmingClose(false);
    beforeConfirmRef.current?.focus();
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedStyleId(styleId);
      setSelectedToneId(toneId);
      setTags(question?.tags || []);
      headingRef.current?.focus({ preventScroll: true });
    } else {
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleRemix = async () => {
    if (!question) return;
    try {
      normalizeQuestionTags(tags);
    } catch (error) {
      const dataMessage = convexErrorData(error)?.message;
      toast.error(
        typeof dataMessage === "string" ? dataMessage : "These tags can't be saved.",
      );
      return;
    }
    const requestId = ++remixRequestIdRef.current;
    const isStale = () => remixRequestIdRef.current !== requestId;
    setRemixState("remixing");
    setSaveFailed(false);
    try {
      const text = await remixQuestion({
        questionId: question._id,
        styleId: selectedStyleId,
        toneId: selectedToneId,
        topicId: question.topicId,
      });
      if (isStale()) return;

      let currentId = newQuestionId;
      if (!currentId) {
        const id = await addPersonalQuestion({
          customText: text,
          isPublic: false,
          styleId: selectedStyleId,
          toneId: selectedToneId,
          topicId: question.topicId,
          tags,
        });
        if (isStale()) {
          if (id) {
            deletePersonalQuestion({ questionId: id }).catch(() => {});
          }
          return;
        }
        if (id) {
          setNewQuestionId(id);
          currentId = id;
        }
      } else {
        await updatePersonalQuestion({
          questionId: currentId,
          customText: text,
          isPublic: false,
          styleId: selectedStyleId,
          toneId: selectedToneId,
          topicId: question.topicId,
          tags,
        });
        if (isStale()) return;
      }

      setRemixedText(text);
      setRemixState("remixed");
    } catch (error) {
      if (isStale()) return;
      const errorData = convexErrorData(error);
      const dataMessage =
        errorData?.code === ERROR_CODES.QUESTION_TEXT_TOO_LONG
          ? ERROR_MESSAGES.AI_REMIX_RESULT_TOO_LONG
          : errorData?.message;
      const message =
        typeof dataMessage === "string"
          ? dataMessage
          : error instanceof Error
            ? error.message
            : String(error);
      toast.error(`Remix failed: ${message}`);
      setSaveFailed(true);
      setRemixState(remixedText ? "remixed" : "idle");
    }
  };

  const handleCancelRemix = () => {
    remixRequestIdRef.current += 1;
    focusAfterCancelRef.current = true;
    setRemixState(remixedText ? "remixed" : "idle");
  };

  const handleSave = async () => {
    if (!newQuestionId) return;
    if (!remixedText.trim()) {
      toast.error(ERROR_MESSAGES.QUESTION_TEXT_REQUIRED);
      return;
    }
    try {
      const updatedQuestion = await updatePersonalQuestion({
        questionId: newQuestionId,
        customText: remixedText,
        isPublic,
        styleId: selectedStyleId,
        toneId: selectedToneId,
        topicId: question.topicId,
        tags,
      });
      if (updatedQuestion && onRemixed) {
        onRemixed(question, updatedQuestion as Doc<"questions">);
      }
      toast.success(
        isPublic
          ? "Question submitted for review!"
          : "Remixed question saved to My questions",
      );
      forceClose();
    } catch (error) {
      const dataMessage = convexErrorData(error)?.message;
      toast.error(
        typeof dataMessage === "string"
          ? dataMessage
          : "Failed to save remixed question.",
      );
    }
  };

  const handleDiscard = async () => {
    if (newQuestionId) {
      try {
        await deletePersonalQuestion({ questionId: newQuestionId });
      } catch {
        // If delete fails, still close
      }
    }
    forceClose();
  };

  const handleAddTag = (tagName?: string) => {
    const tagToAdd = (tagName || tagInput).trim().toLowerCase();
    if (!tagToAdd) return;

    const tagExists = allAvailableTags?.some(
      (t) => t.name.toLowerCase() === tagToAdd,
    );
    if (!tagExists) {
      toast.error(`"${tagToAdd}" is not a valid tag. Please select from the list.`);
      return;
    }

    if (!tags.includes(tagToAdd)) {
      if (tagToAdd.length > MAX_QUESTION_TAG_LENGTH) {
        toast.error(ERROR_MESSAGES.QUESTION_TAG_TOO_LONG);
        return;
      }
      if (tags.length >= MAX_QUESTION_TAGS) {
        toast.error(ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY);
        return;
      }
      setTags([...tags, tagToAdd]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  if (!question || !isOpen) return null;

  const questionText = question.text ?? question.customText ?? "No question text";
  const limitReached = !!currentUser?.isAiLimitReached;
  const cycleStart = currentUser?.aiUsage?.cycleStart;
  const resetsOn =
    cycleStart === undefined
      ? null
      : new Date(cycleStart + AI_USAGE_CYCLE_MS).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
        });

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          handleOpenChange(false);
        }
      }}
      className="flex h-full w-full flex-col gap-5 bg-card p-6 text-left text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-bold tracking-[-0.02em] text-foreground outline-none"
          >
            Remix Question
          </h3>
          <p className="text-sm text-muted-foreground">
            Create your own spin on this question
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentUser && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-semibold",
                limitReached ? "border-destructive/40 text-destructive" : "text-muted-foreground",
              )}
            >
              {currentUser.aiUsage?.count ?? 0}/{currentUser.aiLimit}
              <Sparkles aria-hidden="true" className="size-3.5" />
              <span className="sr-only">AI generations used</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Close remix"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Original question */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Original
          </p>
          <p className="text-sm font-semibold leading-snug text-foreground">
            {questionText}
          </p>
          {(questionStyle || questionTone) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {questionStyle && (
                <Badge
                  variant="outline"
                  className="gap-1.5 rounded-full border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <IconComponent
                    icon={questionStyle.icon as Icon}
                    size={12}
                    color={questionStyle.color}
                  />
                  {questionStyle.name}
                </Badge>
              )}
              {questionTone && (
                <Badge
                  variant="outline"
                  className="gap-1.5 rounded-full border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <IconComponent
                    icon={questionTone.icon as Icon}
                    size={12}
                    color={questionTone.color}
                  />
                  {questionTone.name}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Remixed result */}
        {remixState === "remixing" && (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-muted/30 py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="ml-2.5 text-sm font-medium text-muted-foreground">
              Remixing with AI…
            </span>
          </div>
        )}

        {remixState === "remixed" && remixedText && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5">
            <label
              htmlFor={remixedTextId}
              className="mb-1.5 block text-xs font-semibold text-primary"
            >
              Remixed (you can edit it before saving)
            </label>
            <textarea
              id={remixedTextId}
              value={remixedText}
              onChange={(event) => setRemixedText(event.target.value)}
              maxLength={MAX_QUESTION_TEXT_LENGTH}
              rows={3}
              className="w-full resize-y rounded-xl border border-input bg-background p-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {/* Style / Tone pickers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TaxonomyPicker
            id={styleSelectId}
            label="Style"
            options={styles}
            selectedId={selectedStyleId}
            selectedItem={style}
            onSelect={(value) =>
              setSelectedStyleId(value as Id<"styles"> | undefined)
            }
          />
          <TaxonomyPicker
            id={toneSelectId}
            label="Tone"
            options={tones}
            selectedId={selectedToneId}
            selectedItem={tone}
            onSelect={(value) =>
              setSelectedToneId(value as Id<"tones"> | undefined)
            }
          />
        </div>

        {/* Tags Section */}
        <div className="space-y-2">
          <Label htmlFor={tagInputId} className="text-xs font-semibold text-foreground">
            Tags
          </Label>
          <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-ring">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleRemoveTag(tag)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </Badge>
            ))}
            <input
              id={tagInputId}
              placeholder={tags.length === 0 ? "Choose tags from the list" : ""}
              onFocus={() => setShowTagList(true)}
              value={tagInput}
              maxLength={MAX_QUESTION_TAG_LENGTH}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!tagInput.trim() && focusedSuggestionIndex < 0) return;
                  if (
                    focusedSuggestionIndex >= 0 &&
                    filteredSuggestions[focusedSuggestionIndex]
                  ) {
                    handleAddTag(filteredSuggestions[focusedSuggestionIndex].name);
                  } else if (filteredSuggestions.length > 0) {
                    handleAddTag(filteredSuggestions[0].name);
                  } else {
                    handleAddTag();
                  }
                } else if (e.key === "ArrowDown" && filteredSuggestions.length > 0) {
                  e.preventDefault();
                  setFocusedSuggestionIndex((prev) =>
                    prev < filteredSuggestions.length - 1 ? prev + 1 : prev,
                  );
                } else if (e.key === "ArrowUp" && filteredSuggestions.length > 0) {
                  e.preventDefault();
                  setFocusedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
                } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  handleRemoveTag(tags[tags.length - 1]);
                }
              }}
              className="h-8 min-w-[90px] flex-1 border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded={
                (showTagList || tagInput) && filteredSuggestions.length > 0
                  ? "true"
                  : "false"
              }
            />
          </div>
          {tagInput.trim() && filteredSuggestions.length === 0 && allAvailableTags && (
            <p role="status" className="text-xs text-muted-foreground">
              No tags match what you typed. Tags come from a fixed list.
            </p>
          )}
          {(showTagList || tagInput) && filteredSuggestions.length > 0 && (
            <div
              className="mt-1.5 flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200"
              role="listbox"
              aria-label="Tag suggestions"
            >
              {filteredSuggestions.map((s, index) => (
                <Badge
                  key={s._id}
                  variant="outline"
                  role="option"
                  tabIndex={0}
                  aria-selected={focusedSuggestionIndex === index}
                  className={cn(
                    "cursor-pointer rounded-full border-dashed px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
                    focusedSuggestionIndex === index
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => handleAddTag(s.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleAddTag(s.name);
                    }
                  }}
                  onMouseEnter={() => setFocusedSuggestionIndex(index)}
                >
                  + {s.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Private / Submit toggle */}
        {remixState === "remixed" && (
          <div className="flex items-center space-x-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <Switch
              id="remix-public-toggle"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <div className="space-y-0.5">
              <Label htmlFor="remix-public-toggle" className="cursor-pointer text-sm font-semibold">
                {isPublic ? "Submit for review" : "Keep private"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? "Will be reviewed before being added to the public pool."
                  : "Will be saved to My questions only."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-1 [&_button]:min-h-11">
        {confirmingClose && remixState === "remixed" && (
          <div
            role="alertdialog"
            aria-label="Discard this remix?"
            className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5"
          >
            <p className="text-sm font-semibold text-foreground">Discard this remix?</p>
            <p className="text-sm text-muted-foreground">
              It hasn't been saved. Save keeps it in My questions.
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={handleDiscard}
                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Discard and close
              </Button>
              <Button
                ref={keepEditingRef}
                variant="outline"
                onClick={keepEditing}
                className="flex-1"
              >
                Keep editing
              </Button>
            </div>
          </div>
        )}
        {limitReached && remixState !== "remixing" && (
          <p role="status" className="text-sm text-destructive">
            You've used all your AI generations for this cycle, so Remix is off until{" "}
            {resetsOn ? `it resets on ${resetsOn}` : "it resets"}.
          </p>
        )}
        {limitReached && remixState !== "remixing" && <PackOffer surface="remix" />}
        {remixState === "idle" && (
          <>
            <Button
              ref={remixButtonRef}
              onClick={handleRemix}
              className="gap-2 rounded-full"
              disabled={currentUser?.isAiLimitReached}
            >
              <Sparkles className="size-4" />
              Remix
            </Button>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          </>
        )}

        {remixState === "remixing" && (
          <div className="flex w-full flex-col gap-2">
            <Button disabled className="gap-2 rounded-full">
              <Loader2 className="size-4 animate-spin" />
              Remixing…
            </Button>
            <Button variant="ghost" className="rounded-full" onClick={handleCancelRemix}>
              {remixedText ? "Keep Previous Remix" : "Cancel Remix"}
            </Button>
          </div>
        )}

        {remixState === "remixed" && (
          <>
            <Button ref={saveButtonRef} onClick={handleSave} className="gap-2 rounded-full">
              <Save className="size-4" />
              Save
            </Button>
            <Button
              variant="outline"
              onClick={handleRemix}
              className="gap-2 rounded-full"
              disabled={currentUser?.isAiLimitReached}
            >
              <RotateCcw className="size-4" />
              Remix Again
            </Button>
            <Button
              variant="ghost"
              onClick={handleDiscard}
              className="gap-2 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
