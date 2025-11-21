import { Doc, Id } from "../../../convex/_generated/dataModel";
import { IconComponent, Icon } from "@/components/ui/icons/icon";
import { Heart, ThumbsDown } from "@/components/ui/icons/icons";

interface QuestionTableProps {
  questions: Doc<"questions">[];
  styles: Doc<"styles">[];
  tones: Doc<"tones">[];
  likedQuestions: Id<"questions">[];
  onToggleLike: (questionId: Id<"questions">) => void;
  onRemoveItem: (questionId: Id<"questions">) => void;
}

export function QuestionTable({
  questions,
  styles,
  tones,
  likedQuestions,
  onToggleLike,
  onRemoveItem,
}: QuestionTableProps) {
  return (
    <div className="w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <tr>
            <th className="p-4 font-medium text-gray-500 dark:text-gray-400">Question</th>
            <th className="p-4 font-medium text-gray-500 dark:text-gray-400 w-32">Style</th>
            <th className="p-4 font-medium text-gray-500 dark:text-gray-400 w-32">Tone</th>
            <th className="p-4 font-medium text-gray-500 dark:text-gray-400 text-right w-24">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {questions.map((question) => {
             const style = styles.find((s) => s.id === question.style);
             const tone = tones.find((t) => t.id === question.tone);
             const isFavorite = likedQuestions.includes(question._id);

             return (
               <tr key={question._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group">
                 <td className="p-4 font-medium text-gray-900 dark:text-gray-100">
                   {question.text ?? question.customText}
                 </td>
                 <td className="p-4">
                   {style && (
                     <div className="flex items-center gap-2" title={style.name}>
                       <div className="p-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                         <IconComponent icon={style.icon as Icon} size={16} color={style.color} />
                       </div>
                       <span className="text-xs text-gray-600 dark:text-gray-400 hidden lg:inline">{style.name}</span>
                     </div>
                   )}
                 </td>
                 <td className="p-4">
                   {tone && (
                     <div className="flex items-center gap-2" title={tone.name}>
                       <div className="p-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                         <IconComponent icon={tone.icon as Icon} size={16} color={tone.color} />
                       </div>
                       <span className="text-xs text-gray-600 dark:text-gray-400 hidden lg:inline">{tone.name}</span>
                     </div>
                   )}
                 </td>
                 <td className="p-4 text-right">
                   <div className="flex items-center justify-end gap-2">
                     <button
                       onClick={() => onToggleLike(question._id)}
                       className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                       title={isFavorite ? "Unlike" : "Like"}
                     >
                       <Heart
                         size={18}
                         className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-400'}
                       />
                     </button>
                     <button
                       onClick={() => onRemoveItem(question._id)}
                       className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                       title="Hide"
                     >
                       <ThumbsDown
                         size={18}
                         className="text-gray-400"
                       />
                     </button>
                   </div>
                 </td>
               </tr>
             );
          })}
        </tbody>
      </table>
    </div>
  );
}
