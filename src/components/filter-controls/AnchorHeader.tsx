import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { IconComponent, Icon } from "../ui/icons/icon";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";
import { X } from "lucide-react";

interface AnchorHeaderProps {
  styleId?: Id<"styles"> | null;
  toneId?: Id<"tones"> | null;
  topicId?: Id<"topics"> | null;
  onRemoveStyle: () => void;
  onRemoveTone: () => void;
  onRemoveTopic: () => void;
}

export const AnchorHeader = ({
  styleId,
  toneId,
  topicId,
  onRemoveStyle,
  onRemoveTone,
  onRemoveTopic,
}: AnchorHeaderProps) => {
  const style = useQuery(api.core.styles.getStyleById, styleId ? { id: styleId } : "skip");
  const tone = useQuery(api.core.tones.getToneById, toneId ? { id: toneId } : "skip");
  const topic = useQuery(api.core.topics.getTopicById, topicId ? { id: topicId } : "skip");

  if (!styleId && !toneId && !topicId) return null;

  return (
    <div className="sticky top-[var(--header-h,4rem)] z-40 w-full px-4 py-2 flex flex-wrap gap-2 justify-center backdrop-blur-md bg-white/5 dark:bg-black/20 border-b border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
      {style && (
        <AnchorChip
          type="Style"
          label={style.name}
          description={style.description}
          icon={style.icon as Icon}
          color={style.color}
          onRemove={onRemoveStyle}
        />
      )}
      {tone && (
        <AnchorChip
          type="Tone"
          label={tone.name}
          description={tone.description}
          icon={tone.icon as Icon}
          color={tone.color}
          onRemove={onRemoveTone}
        />
      )}
      {topic && (
        <AnchorChip
          type="Topic"
          label={topic.name}
          description={topic.description}
          icon={(topic.icon || "CircleHelp") as Icon}
          color={topic.color || "#888"}
          onRemove={onRemoveTopic}
        />
      )}
    </div>
  );
};

/** One anchor in the bar. Tapping the name drops a popover down from the chip; the X removes it. */
const AnchorChip = ({
  type,
  label,
  description,
  icon,
  color,
  onRemove,
}: {
  type: "Style" | "Tone" | "Topic";
  label: string;
  description?: string;
  icon: Icon;
  color: string;
  onRemove: () => void;
}) => (
  <Popover>
    <PopoverAnchor asChild>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 dark:bg-black/40 border border-white/20 shadow-sm transition-colors hover:bg-white/20">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${type}: ${label}`}
            className="flex items-center gap-2 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <IconComponent icon={icon} size={16} color={color} />
            <span className="text-xs font-bold text-white uppercase tracking-wider">{label}</span>
          </button>
        </PopoverTrigger>
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded-full hover:bg-white/20 text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label={`Remove ${label} anchor`}
        >
          <X size={14} />
        </button>
      </div>
    </PopoverAnchor>
    <PopoverContent
      side="bottom"
      align="center"
      sideOffset={8}
      collisionPadding={12}
      className="w-72 rounded-2xl p-4"
      style={{
        backgroundImage: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${color} 18%, transparent), transparent 70%)`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
            boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        >
          <IconComponent icon={icon} size={20} color={color} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {type}
          </p>
          <p className="truncate text-base font-bold leading-tight">{label}</p>
        </div>
      </div>
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{description}</p>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="mt-4 w-full rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/10"
      >
        Remove anchor
      </button>
    </PopoverContent>
  </Popover>
);
