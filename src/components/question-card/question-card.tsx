import { motion, PanInfo, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { Doc } from "../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { useThemeListener } from "../../hooks/useTheme";
import { Share2 } from "lucide-react";

interface QuestionCardProps {
  currentQuestion: Doc<"questions">;
  liked: boolean;
  handleDiscard: () => Promise<void>;
  toggleLike: () => Promise<void>;
}

export const QuestionCard = ({ currentQuestion, liked, handleDiscard, toggleLike }: QuestionCardProps) => {
  const [isLiked, setIsLiked] = useState(liked);
  const theme = useThemeListener();
  // Motion controls
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-30, 30]);
  const opacity = useTransform(x, [-150, 0, 150], [0, 1, 0]);

  // Initialize empty heart based on theme
  const [emptyHeart, setEmptyHeart] = useState<"🖤" | "🤍">(() => 
    theme === "dark" ? "🖤" : "🤍"
  );

  // Update empty heart when theme changes
  useEffect(() => {
    console.log("theme changed to:", theme);
    setEmptyHeart(theme === "dark" ? "🖤" : "🤍");
  }, [theme]);

  // Update isLiked when the liked prop changes
  useEffect(() => {
    setIsLiked(liked);
  }, [liked]);

  const handleDragEnd = async () => {
    if (Math.abs(x.get()) > 50) { // If the card is swiped a long way, discard it
      await handleDiscard();
    }
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    await toggleLike();
  };

  const handleShare = () => {
    if (!currentQuestion || !navigator.share) return;

    const shareUrl = `${window.location.origin}/question/${currentQuestion._id}`;

    try {
      void navigator.share({
        title: 'Ice Breaker Question',
        text: currentQuestion.text,
        url: shareUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
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
      <div className="absolute bottom-6 right-6 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleLike();
          }}
          className="text-2xl transition-colors"
        >
          {isLiked ? "❤️" : emptyHeart}
        </button>
        {typeof navigator.share === 'function' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleShare();
            }}
            className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            title="Share question"
          >
            <Share2 size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
        )}
      </div>
    </div>
  </motion.div>
};
