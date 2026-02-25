import React from 'react';
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { IconComponent, Icon } from "../ui/icons/icon";
import { X } from "lucide-react";

interface AnchorHeaderProps {
  styleId?: Id<"styles"> | null;
  toneId?: Id<"tones"> | null;
  topicId?: Id<"topics"> | null;
  onRemoveStyle: () => void;
  onRemoveTone: () => void;
  onRemoveTopic: () => void;
  onOpenItem: (type: "Style" | "Tone" | "Topic", item: any) => void;
}

export const AnchorHeader = ({
  styleId,
  toneId,
  topicId,
  onRemoveStyle,
  onRemoveTone,
  onRemoveTopic,
  onOpenItem
}: AnchorHeaderProps) => {
  const style = useQuery(api.core.styles.getStyleById, styleId ? { id: styleId as Id<"styles"> } : "skip");
  const tone = useQuery(api.core.tones.getToneById, toneId ? { id: toneId as Id<"tones"> } : "skip");
  const topic = useQuery(api.core.topics.getTopicById, topicId ? { id: topicId as Id<"topics"> } : "skip");

  if (!styleId && !toneId && !topicId) return null;

  return (
    <div className="sticky top-[72px] z-40 w-full px-4 py-2 flex flex-wrap gap-2 justify-center backdrop-blur-md bg-white/5 dark:bg-black/20 border-b border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
      {style && (
        <AnchorChip
          label={style.name}
          icon={style.icon as Icon}
          color={style.color}
          onRemove={onRemoveStyle}
          onClick={() => onOpenItem("Style", style)}
        />
      )}
      {tone && (
        <AnchorChip
          label={tone.name}
          icon={tone.icon as Icon}
          color={tone.color}
          onRemove={onRemoveTone}
          onClick={() => onOpenItem("Tone", tone)}
        />
      )}
      {topic && (
        <AnchorChip
          label={topic.name}
          icon={(topic.icon || "CircleHelp") as Icon}
          color={topic.color || "#888"}
          onRemove={onRemoveTopic}
          onClick={() => onOpenItem("Topic", topic)}
        />
      )}
    </div>
  );
};

const AnchorChip = ({
  label,
  icon,
  color,
  onRemove,
  onClick
}: {
  label: string;
  icon: Icon;
  color: string;
  onRemove: () => void;
  onClick: () => void;
}) => (
  <div
    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 dark:bg-black/40 border border-white/20 shadow-sm transition-all hover:bg-white/20 cursor-pointer"
    onClick={onClick}
  >
    <IconComponent icon={icon} size={16} color={color} />
    <span className="text-xs font-bold text-white uppercase tracking-wider">{label}</span>
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="p-0.5 rounded-full hover:bg-white/20 text-white/60 hover:text-white"
    >
      <X size={14} />
    </button>
  </div>
);
