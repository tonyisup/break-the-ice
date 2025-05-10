import { motion, PanInfo, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState } from "react";

interface QuestionCardProps {
  currentQuestion: Doc<"questions">;
  liked: boolean;
  handleDiscard: () => Promise<void>;
  toggleLike: () => Promise<void>;
}

export const QuestionCard = ({ currentQuestion, liked, handleDiscard, toggleLike }: QuestionCardProps) => {
  const [isLiked, setIsLiked] = useState(liked);
  // Motion controls
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-30, 30]);
  const opacity = useTransform(x, [-150, 0, 150], [0, 1, 0]);

  const handleDragEnd = async () => {
    if (Math.abs(x.get()) > 50) { // If the card is swiped a long way, discard it
      await handleDiscard();
    }
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    await toggleLike();
  };

  return <motion.div
    className="max-w-[500px] aspect-[2.5/3.5] relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 transform hover:cursor-pointer active:cursor-grabbing origin-bottom"
    style={{
      x,
      y,
      rotate,
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      opacity,
      transition: "0.125s transform",
    }}
    drag="x"
    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
    dragElastic={0.7}
    onDragEnd={handleDragEnd}
    onDoubleClick={handleLike}
  >
    <div className="h-full flex flex-col justify-between">
      <div className="text-xl md:text-2xl text-center my-auto px-2">
        {currentQuestion.text}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleLike();
        }}
        className="absolute bottom-6 right-6 text-2xl"
      >
        {isLiked ? "❤️" : "🖤"}
      </button>
    </div>
  </motion.div>
};
