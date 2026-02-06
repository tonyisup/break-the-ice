import { Doc, Id } from "../../../convex/_generated/dataModel";
import { IconComponent, Icon } from "@/components/ui/icons/icon";
import { Heart, ThumbsDown } from "@/components/ui/icons/icons";
import { cn } from "@/lib/utils";

interface QuestionGridProps {
  questions: Doc<"questions">[];
  styles: Doc<"styles">[];
  tones: Doc<"tones">[];
  likedQuestions: Id<"questions">[];
  hiddenQuestions: Id<"questions">[];
  onToggleLike: (questionId: Id<"questions">) => void;
  onRemoveItem: (questionId: Id<"questions">) => void;
  variant?: "card" | "condensed";
}

// Helper to render status badge
const getStatusBadge = (status?: string) => {
  if (status === 'public') {
    return (
      <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-medium border border-blue-200 dark:border-blue-800 shrink-0">
        Public
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-[10px] px-1.5 py-0.5 rounded font-medium border border-yellow-200 dark:border-yellow-800 shrink-0">
        Pending
      </span>
    );
  }
  if (status === 'private') {
    return (
      <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-[10px] px-1.5 py-0.5 rounded font-medium border border-green-200 dark:border-green-800 shrink-0">
        Private
      </span>
    );
  }
  return null;
};

export function QuestionGrid({
  questions,
  styles,
  tones,
  likedQuestions,
  hiddenQuestions,
  onToggleLike,
  onRemoveItem,
  variant = "card",
}: QuestionGridProps) {
  const isCondensed = variant === "condensed";

  return (
    <div className={cn(
      "grid gap-4",
      isCondensed
        ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    )}>
      {questions.map((question) => {
        const style = styles.find((s) => s.id === question.style);
        const tone = tones.find((t) => t.id === question.tone);
        const isFavorite = likedQuestions.includes(question._id);
        const isHidden = hiddenQuestions.includes(question._id);

        if (isCondensed) {
          return (
            <div
              key={question._id}
              className="flex flex-col p-3 bg-white dark:bg-gray-950 rounded-md border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all relative group h-full"
            >
              <div className="flex-grow mb-2">
                <p className="text-gray-900 dark:text-gray-100 text-sm line-clamp-6 leading-relaxed">
                  {question.text ?? question.customText}
                </p>
              </div>

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-900/50">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  {getStatusBadge(question.status)}
                  {style && (
                    <div title={`Style: ${style.name}`} className="shrink-0">
                      <IconComponent icon={style.icon as Icon} size={14} color={style.color} />
                    </div>
                  )}
                  {tone && (
                    <div title={`Tone: ${tone.name}`} className="shrink-0">
                      <IconComponent icon={tone.icon as Icon} size={14} color={tone.color} />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLike(question._id); }}
                    className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-red-500"
                    title={isFavorite ? "Unlike" : "Like"}
                  >
                    <Heart
                      size={14}
                      className={isFavorite ? 'text-red-500 fill-red-500' : ''}
                    />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(question._id); }}
                    className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    title={isHidden ? "Unhide" : "Hide"}
                  >
                    <ThumbsDown
                      size={14}
                      className={isHidden ? 'text-blue-500 fill-blue-500' : ''}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={question._id}
            className="flex flex-col p-4 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow relative group h-full"
          >
            {/* Header with Style and Tone */}
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 overflow-hidden flex-wrap">
                {style && (
                  <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400 shrink-0" title={`Style: ${style.name}`}>
                    <IconComponent icon={style.icon as Icon} size={12} color={style.color} />
                    <span className="truncate max-w-[80px]">{style.name}</span>
                  </div>
                )}
                {tone && (
                  <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400 shrink-0" title={`Tone: ${tone.name}`}>
                    <IconComponent icon={tone.icon as Icon} size={12} color={tone.color} />
                    <span className="truncate max-w-[80px]">{tone.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Question Text */}
            <div className="flex-grow mb-4">
              <p className="text-gray-900 dark:text-gray-100 font-medium line-clamp-4 text-sm leading-relaxed">
                {question.text ?? question.customText}
              </p>
            </div>

            {/* Footer with Actions */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-900">
              <div className="flex items-center gap-2">
                {getStatusBadge(question.status)}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleLike(question._id)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-red-500"
                  title={isFavorite ? "Unlike" : "Like"}
                >
                  <Heart
                    size={16}
                    className={isFavorite ? 'text-red-500 fill-red-500' : ''}
                  />
                </button>
                <button
                  onClick={() => onRemoveItem(question._id)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  title={isHidden ? "Unhide" : "Hide"}
                >
                  <ThumbsDown
                    size={16}
                    className={isHidden ? 'text-blue-500 fill-blue-500' : ''}
                  />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
