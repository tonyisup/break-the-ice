import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { IconComponent, Icon } from "../ui/icons/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";

export type FeedFilterKey = "style" | "tone" | "topic";

export interface FeedFilterOption {
  _id: string;
  /** What goes in the URL. */
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface FeedFilterBarProps {
  styles: FeedFilterOption[];
  tones: FeedFilterOption[];
  topics: FeedFilterOption[];
  selectedStyleId?: string | null;
  selectedToneId?: string | null;
  selectedTopicId?: string | null;
  /** Called with the option's slug, or null to clear that filter. */
  onChange: (key: FeedFilterKey, slug: string | null) => void;
  /** How many styles and tones the person has hidden in Settings. */
  hiddenStyleCount?: number;
  hiddenToneCount?: number;
  /** Clears every filter in one step. */
  onClearAll: () => void;
  /** Retained for compatibility; button trigger works inline or in headers. */
  sticky?: boolean;
  /** When true, hides the active chip strip beside the button (useful when chips render elsewhere). */
  hideActiveChips?: boolean;
  /** Compact icon-first button for tight containers like the top header. */
  compact?: boolean;
  className?: string;
}

interface TaxonomyDoc {
  _id: string;
  id?: string;
  slug?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** Styles, tones or topics as filter options. */
export const toFilterOptions = (
  docs: TaxonomyDoc[] | undefined,
): FeedFilterOption[] =>
  (docs ?? []).map((doc) => ({
    _id: doc._id,
    slug: doc.slug ?? doc.id ?? doc._id,
    name: doc.name,
    description: doc.description,
    icon: doc.icon,
    color: doc.color,
  }));

/**
 * Filter state for a page that filters a list it already holds (Liked, History).
 */
export function useFilterBarState(
  styles: TaxonomyDoc[] | undefined,
  tones: TaxonomyDoc[] | undefined,
  topics: TaxonomyDoc[] | undefined,
) {
  const [chosen, setChosen] = useState<Record<FeedFilterKey, string | null>>({
    style: null,
    tone: null,
    topic: null,
  });
  const options = useMemo(
    () => ({
      style: toFilterOptions(styles),
      tone: toFilterOptions(tones),
      topic: toFilterOptions(topics),
    }),
    [styles, tones, topics],
  );
  const choice = useMemo(
    () => ({
      style: options.style.find((option) => option.slug === chosen.style) ?? null,
      tone: options.tone.find((option) => option.slug === chosen.tone) ?? null,
      topic: options.topic.find((option) => option.slug === chosen.topic) ?? null,
    }),
    [options, chosen],
  );
  return {
    choice,
    hasFilters: !!(choice.style || choice.tone || choice.topic),
    clear: () => setChosen({ style: null, tone: null, topic: null }),
    barProps: {
      styles: options.style,
      tones: options.tone,
      topics: options.topic,
      selectedStyleId: choice.style?._id ?? null,
      selectedToneId: choice.tone?._id ?? null,
      selectedTopicId: choice.topic?._id ?? null,
      onChange: (key: FeedFilterKey, slug: string | null) =>
        setChosen((previous) => ({ ...previous, [key]: slug })),
      onClearAll: () => setChosen({ style: null, tone: null, topic: null }),
    },
  };
}

interface ActiveFilterChip {
  key: FeedFilterKey;
  label: "Style" | "Tone" | "Topic";
  option: FeedFilterOption;
}

/**
 * Slim strip of active filter chips; renders nothing when no filters are selected.
 */
export function ActiveFilterChips({
  styles,
  tones,
  topics,
  selectedStyleId,
  selectedToneId,
  selectedTopicId,
  onChange,
  onClearAll,
  className,
}: Pick<
  FeedFilterBarProps,
  | "styles"
  | "tones"
  | "topics"
  | "selectedStyleId"
  | "selectedToneId"
  | "selectedTopicId"
  | "onChange"
  | "onClearAll"
  | "className"
>) {
  const active: ActiveFilterChip[] = [];
  const selectedStyle = selectedStyleId
    ? styles.find((s) => s._id === selectedStyleId)
    : undefined;
  const selectedTone = selectedToneId
    ? tones.find((t) => t._id === selectedToneId)
    : undefined;
  const selectedTopic = selectedTopicId
    ? topics.find((t) => t._id === selectedTopicId)
    : undefined;

  if (selectedStyle) active.push({ key: "style", label: "Style", option: selectedStyle });
  if (selectedTone) active.push({ key: "tone", label: "Tone", option: selectedTone });
  if (selectedTopic) active.push({ key: "topic", label: "Topic", option: selectedTopic });

  if (active.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Active filters"
      className={cn("flex flex-wrap items-center justify-center gap-2", className)}
    >
      {active.map(({ key, label, option }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs font-semibold text-foreground shadow-sm"
        >
          {option.icon && (
            <span aria-hidden="true" className="shrink-0">
              <IconComponent icon={option.icon as Icon} size={14} color={option.color} />
            </span>
          )}
          <span className="font-normal text-muted-foreground">{label}:</span>
          <span className="max-w-[9rem] truncate">{option.name}</span>
          <button
            type="button"
            onClick={() => onChange(key, null)}
            aria-label={`Remove ${option.name} filter`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {active.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-9 rounded-full px-3 text-xs font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/**
 * Collapsible question filters tucked behind a single Filter button.
 * Opens a clean tabbed popover (Style / Tone / Topic) so the feed stays uncluttered.
 */
export const FeedFilterBar = ({
  styles,
  tones,
  topics,
  selectedStyleId,
  selectedToneId,
  selectedTopicId,
  onChange,
  onClearAll,
  hiddenStyleCount = 0,
  hiddenToneCount = 0,
  hideActiveChips = false,
  compact = false,
  className,
}: FeedFilterBarProps) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FeedFilterKey>("style");

  const activeCount = [selectedStyleId, selectedToneId, selectedTopicId].filter(
    Boolean,
  ).length;

  const tabs: {
    key: FeedFilterKey;
    label: "Style" | "Tone" | "Topic";
    options: FeedFilterOption[];
    selectedId?: string | null;
    hiddenCount?: number;
  }[] = [
    {
      key: "style",
      label: "Style",
      options: styles,
      selectedId: selectedStyleId,
      hiddenCount: hiddenStyleCount,
    },
    {
      key: "tone",
      label: "Tone",
      options: tones,
      selectedId: selectedToneId,
      hiddenCount: hiddenToneCount,
    },
    {
      key: "topic",
      label: "Topic",
      options: topics,
      selectedId: selectedTopicId,
      hiddenCount: 0,
    },
  ];

  const currentTab = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const currentKind = currentTab.label.toLowerCase();

  const choose = (key: FeedFilterKey, slug: string | null) => {
    onChange(key, slug);
  };

  return (
    <div
      role="group"
      aria-label="Filter questions"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              activeCount > 0
                ? `Filter questions (${activeCount} active)`
                : "Filter questions"
            }
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeCount > 0
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-card text-foreground hover:bg-accent",
              compact ? "px-3 sm:px-3.5" : "px-4",
            )}
          >
            <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
            <span className={cn(compact && "hidden sm:inline")}>Filters</span>
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl p-0 overflow-hidden"
        >
          {/* Header + Clear all */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-foreground">Filter questions</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Category segmented tabs */}
          <div
            role="tablist"
            aria-label="Filter categories"
            className="grid grid-cols-3 gap-1 border-b border-border bg-muted/40 p-1.5"
          >
            {tabs.map((tab) => {
              const isSelectedTab = tab.key === currentTab.key;
              const hasValue = !!tab.selectedId;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isSelectedTab}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelectedTab
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{tab.label}</span>
                  {hasValue && (
                    <span
                      className="size-1.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Options list for active tab */}
          <div className="max-h-[52vh] overflow-y-auto p-2">
            <ul className="flex flex-col gap-0.5">
              <li>
                <OptionRow
                  name={`Any ${currentKind}`}
                  isSelected={!currentTab.selectedId}
                  onClick={() => choose(currentTab.key, null)}
                />
              </li>
              {currentTab.options.map((option) => (
                <li key={option._id}>
                  <OptionRow
                    name={option.name}
                    description={option.description}
                    icon={option.icon}
                    color={option.color}
                    isSelected={option._id === currentTab.selectedId}
                    onClick={() => choose(currentTab.key, option.slug)}
                  />
                </li>
              ))}
            </ul>

            {(currentTab.hiddenCount ?? 0) > 0 && (
              <p className="mt-2 border-t border-border px-3 pt-2 text-xs text-muted-foreground">
                {currentTab.hiddenCount === 1
                  ? `1 ${currentKind} is hidden.`
                  : `${currentTab.hiddenCount} ${currentKind}s are hidden.`}{" "}
                <Link
                  to={`/settings?expand=manage-${currentKind}s`}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-9 items-center font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show hidden {currentKind}s in Settings
                </Link>
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {!hideActiveChips && (
        <ActiveFilterChips
          styles={styles}
          tones={tones}
          topics={topics}
          selectedStyleId={selectedStyleId}
          selectedToneId={selectedToneId}
          selectedTopicId={selectedTopicId}
          onChange={onChange}
          onClearAll={onClearAll}
          className="justify-start"
        />
      )}
    </div>
  );
};

const OptionRow = ({
  name,
  description,
  icon,
  color,
  isSelected,
  onClick,
}: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={isSelected}
    onClick={onClick}
    className={cn(
      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isSelected && "bg-accent",
    )}
  >
    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
      {icon && <IconComponent icon={icon as Icon} size={18} color={color} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-foreground">{name}</span>
      {description && (
        <span className="block text-xs leading-snug text-muted-foreground line-clamp-2">
          {description}
        </span>
      )}
    </span>
    {isSelected && <Check size={16} aria-hidden="true" className="shrink-0 text-primary" />}
  </button>
);
