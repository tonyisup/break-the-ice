import { Doc, Id } from "../../../convex/_generated/dataModel";
import { IconComponent, Icon } from "@/components/ui/icons/icon";
import { Heart, ThumbsDown } from "@/components/ui/icons/icons";

interface CompactQuestionListProps {
  questions: Doc<"questions">[];
  styles: Doc<"styles">[];
  tones: Doc<"tones">[];
  likedQuestions: Id<"questions">[];
  onToggleLike: (questionId: Id<"questions">) => void;
  onRemoveItem: (questionId: Id<"questions">) => void;
}

export function CompactQuestionList({
  questions,
  styles,
  tones,
  likedQuestions,
  onToggleLike,
  onRemoveItem,
}: CompactQuestionListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {questions.map((question) => {
        const style = styles.find((s) => s.id === question.style);
        const tone = tones.find((t) => t.id === question.tone);
        const isFavorite = likedQuestions.includes(question._id);

        return (
          <div
            key={question._id}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow group h-full"
          >
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-4 leading-relaxed">
              {question.text ?? question.customText}
            </p>

            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3 mt-auto">
              <div className="flex items-center gap-2">
                {style && (
                  <div title={style.name} className="bg-gray-100 dark:bg-gray-900 p-1.5 rounded-full">
                     <IconComponent icon={style.icon as Icon} size={14} color={style.color} />
                  </div>
                )}
                {tone && (
                  <div title={tone.name} className="bg-gray-100 dark:bg-gray-900 p-1.5 rounded-full">
                     <IconComponent icon={tone.icon as Icon} size={14} color={tone.color} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                 <button
                   onClick={() => onToggleLike(question._id)}
                   className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                   title={isFavorite ? "Unlike" : "Like"}
                 >
                   <Heart
                     size={16}
                     className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-400'}
                   />
                 </button>
                 <button
                   onClick={() => onRemoveItem(question._id)}
                   className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                   title="Hide"
                 >
                   <ThumbsDown
                     size={16}
                     className="text-gray-400"
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
