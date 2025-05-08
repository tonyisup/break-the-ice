import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "~/lib/utils";
import { QuestionCard } from "./questionCard";
import type { CardDirection } from "./hooks/useCardStack";

import type { Question as PrismaQuestion, Tag } from "@prisma/client";
import CardShuffleLoader from "./shuffle-loader/card-shuffle-loader";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};
interface CardStackProps {
  cards: Question[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  filtering: boolean;
  cardSize?: {
    width?: number;
    height?: number;
  };
  onDrag: (info: PanInfo, id: number) => void;
  onDragEnd: (info: PanInfo, id: number) => void;
  isLoading: boolean;
}

export function CardStack({
  cards,
  direction,
  skipping,
  liking,
  cardSize,
  onDrag,
  onDragEnd,
  isLoading,
}: CardStackProps) {
  return (
    <div style={{ width: cardSize?.width ?? 280, height: cardSize?.height ?? 480 }}>
      <div className="relative h-full w-full">
        {isLoading && <div className="flex flex-col gap-4 items-center justify-center h-[480px]">
          <div className="flex flex-col items-center gap-4">
            <CardShuffleLoader />
          </div>
        </div>}
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
                          "bg-gray-500 text-white",
                          "transition-opacity duration-200",
                          liking && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        PASS
                      </div>
                      <div
                        className={cn(
                          "absolute top-6 right-6 rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                          "bg-gray-500 text-white",
                          "transition-opacity duration-200",
                          skipping && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        PASS
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