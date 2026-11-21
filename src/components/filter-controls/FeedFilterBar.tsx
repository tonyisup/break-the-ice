import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
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

interface FeedFilterBarProps {
  styles: FeedFilterOption[];
  tones: FeedFilterOption[];
  topics: FeedFilterOption[];
  selectedStyleId?: string | null;
  selectedToneId?: string | null;
  selectedTopicId?: string | null;
  /** Called with the option's slug, or null to clear that filter. */
  onChange: (key: FeedFilterKey, slug: string | null) => void;
  /** Clears every filter in one step. Three onChange calls in a row can each start from the
   *  same stale state (the feed keeps its filters in the URL), so this is its own callback. */
  onClearAll: () => void;
  /** The feed's bar sticks under the header; on other pages it sits in the page. */
  sticky?: boolean;
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

/** Styles, tones or topics as the bar's options. */
export const toFilterOptions = (docs: TaxonomyDoc[] | undefined): FeedFilterOption[] =>
  (docs ?? []).map((doc) => ({
    _id: doc._id,
    slug: doc.slug ?? doc.id ?? doc._id,
    name: doc.name,
    description: doc.description,
    icon: doc.icon,
    color: doc.color,
  }));

/**
 * The bar's state for a page that filters a list it already holds (Liked, History): what to
 * spread onto the bar, the chosen options for useFilter, and a way to clear them.
 */
export function useFilterBarState(styles: TaxonomyDoc[] | undefined, tones: TaxonomyDoc[] | undefined, topics: TaxonomyDoc[] | undefined) {
  const [chosen, setChosen] = useState<Record<FeedFilterKey, string | null>>({ style: null, tone: null, topic: null });
  const options = useMemo(
    () => ({ style: toFilterOptions(styles), tone: toFilterOptions(tones), topic: toFilterOptions(topics) }),
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
      onChange: (key: FeedFilterKey, slug: string | null) => setChosen((previous) => ({ ...previous, [key]: slug })),
      onClearAll: () => setChosen({ style: null, tone: null, topic: null }),
    },
  };
}

/**
 * The feed's filters: one pill each for style, tone and topic, always on screen under the
 * header. A pill opens the list of choices; a chosen filter shows its name and an X.
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
  sticky = true,
}: FeedFilterBarProps) => (
  <div
    role="group"
    aria-label="Filter questions"
    // The pills wrap to a second line when chosen names make them wide, so all three are
    // always on screen; a row that scrolled sideways hid the last one.
    className={cn(
      "w-full bg-black/40 px-3 py-2 backdrop-blur-md",
      sticky ? "sticky top-[var(--header-h,4rem)] z-40 border-b border-white/10" : "rounded-2xl",
    )}
  >
    <div className="flex flex-wrap justify-center gap-2">
    <FilterPill label="Style" options={styles} selectedId={selectedStyleId} onChange={(slug) => onChange("style", slug)} />
    <FilterPill label="Tone" options={tones} selectedId={selectedToneId} onChange={(slug) => onChange("tone", slug)} />
    <FilterPill label="Topic" options={topics} selectedId={selectedTopicId} onChange={(slug) => onChange("topic", slug)} />
    {[selectedStyleId, selectedToneId, selectedTopicId].filter(Boolean).length > 1 && (
      <button
        type="button"
        onClick={onClearAll}
        className="min-h-11 rounded-full px-3 text-sm font-semibold text-white underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Clear all
      </button>
    )}
    </div>
  </div>
);

const FilterPill = ({
  label,
  options,
  selectedId,
  onChange,
}: {
  label: "Style" | "Tone" | "Topic";
  options: FeedFilterOption[];
  selectedId?: string | null;
  onChange: (slug: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = selectedId ? options.find((option) => option._id === selectedId) : undefined;
  const kind = label.toLowerCase();

  const choose = (slug: string | null) => {
    onChange(slug);
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center rounded-full border text-sm font-semibold text-white",
        selected ? "border-white/60 bg-black/60" : "border-white/30 bg-black/40",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={selected ? `${label}: ${selected.name}. Change ${kind}` : `Choose a ${kind}`}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full pl-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              selected ? "pr-1" : "pr-3",
            )}
          >
            {selected?.icon && (
              <span aria-hidden="true">
                <IconComponent icon={selected.icon as Icon} size={16} color={selected.color} />
              </span>
            )}
            {selected && <span className="font-normal text-white/80">{label}:</span>}
            <span className="max-w-[8rem] truncate">{selected ? selected.name : label}</span>
            {!selected && <ChevronDown size={16} aria-hidden="true" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="max-h-[60vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-2"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <ul className="flex flex-col">
            <li>
              <OptionRow name={`Any ${kind}`} isSelected={!selected} onClick={() => choose(null)} />
            </li>
            {options.map((option) => (
              <li key={option._id}>
                <OptionRow
                  name={option.name}
                  description={option.description}
                  icon={option.icon}
                  color={option.color}
                  isSelected={option._id === selectedId}
                  onClick={() => choose(option.slug)}
                />
              </li>
            ))}
          </ul>

        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove ${selected.name} filter`}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
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
      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/10",
      isSelected && "bg-black/5 dark:bg-white/10",
    )}
  >
    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
      {icon && <IconComponent icon={icon as Icon} size={20} color={color} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{name}</span>
      {description && (
        <span className="block text-xs leading-snug text-gray-600 line-clamp-2 dark:text-gray-300">{description}</span>
      )}
    </span>
    {isSelected && <Check size={16} aria-hidden="true" className="shrink-0" />}
  </button>
);
