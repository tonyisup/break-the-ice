import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "~/lib/utils";
import { QuestionCard } from "./questionCard";
import type { CardDirection } from "./hooks/useCardStack";
import type { Question } from "./types";

interface CardStackProps {
  cards: Question[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  cardSize?: {
    width?: number;
    height?: number;
  };
  onDrag: (info: PanInfo, id: string) => void;
  onDragEnd: (info: PanInfo, id: string) => void;
}

export function CardStack({ 
  cards, 
  direction, 
  skipping, 
  liking,
  cardSize,
  onDrag, 
  onDragEnd 
}: CardStackProps) {
  return (
    <div className="flex-1" style={{ width: cardSize?.width ?? 280, height: cardSize?.height ?? 480 }}>
      <div className="relative h-full w-full">
        {cards && cards.length > 0 && (
          <AnimatePresence>
            {cards.map((card, index) => (
              <motion.div
                key={card.id}
                className={cn(
                  "absolute w-full max-w-[320px]",
                  "cursor-grab active:cursor-grabbing",
                )}
                style={{
                  height: (cardSize?.height ?? 480) - 60, // Subtracting 60 to maintain same ratio as original
                  zIndex: cards.length - index,
                  top: index * 4,
                  left: index * 2,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  transformOrigin: "bottom center",
                }}
                drag={index === 0}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0.9}
                onDrag={(_, info) => onDrag(info, card.id)}
                onDragEnd={(_, info) => onDragEnd(info, card.id)}
                whileDrag={{ scale: 1.05 }}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={
                  direction === "left"
                    ? { x: -300, opacity: 0, rotate: -20 }
                    : direction === "right"
                      ? { x: 300, opacity: 0, rotate: 20 }
                      : { opacity: 0 }
                }
                transition={{ duration: 0.3 }}
                role="article"
                aria-label={`Question card ${index + 1} of ${cards.length}`}
              >
                <div className="h-full">
                  <QuestionCard question={card} />
                  {index === 0 && (
                    <>
                      <div
                        className={cn(
                          "absolute top-6 left-6 rounded-lg px-4 py-2 font-bold transform -rotate-12 opacity-0",
                          "bg-green-500 text-white",
                          "transition-opacity duration-200",
                          (liking && direction === "right") && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        LIKE
                      </div>
                      <div
                        className={cn(
                          "absolute top-6 right-6 rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                          "bg-red-500 text-white",
                          "transition-opacity duration-200",
                          (skipping && direction === "left") && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        SKIP
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
} 