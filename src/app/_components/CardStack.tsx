import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "~/lib/utils";
import { QuestionCard } from "./questionCard";
import type { CardDirection } from "./hooks/useCardStack";

import type { Question as PrismaQuestion, Tag } from "@prisma/client";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { ImportIcon } from "lucide-react";
import { Slider } from "~/components/ui/slider";
import CardShuffleLoader from "./shuffle-loader/card-shuffle-loader";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};
interface CardStackProps {
  advancedMode: boolean;
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
  onGetMore: () => void;
  isLoading: boolean;
  autoGetMore: boolean;
  setAutoGetMore: (autoGetMore: boolean) => void;
  drawCount: number;
  setDrawCount: (drawCount: number) => void;
}

export function CardStack({ 
  advancedMode,
  cards, 
  direction, 
  skipping, 
  liking,
  filtering,
  cardSize,
  onDrag, 
  onDragEnd,
  onGetMore,
  isLoading,
  autoGetMore,
  setAutoGetMore,
  drawCount,
  setDrawCount
}: CardStackProps) {
  const handleDrawCountChange = (value: number[]) => {
    setDrawCount(value[0] ?? 5);
  }
  return (
    <div className="flex-1" style={{ width: cardSize?.width ?? 280, height: cardSize?.height ?? 480 }}>
      <div className="relative h-full w-full">
        {isLoading && <div className="flex flex-col gap-4 items-center justify-center h-[480px]">
        <div className="flex flex-col items-center gap-4">
          <CardShuffleLoader />
        </div>
        </div>}
        {!isLoading && (!cards || cards.length == 0) && <div className="flex flex-col gap-4 items-center justify-center h-[480px]">
          <p className="text-xl mb-4">No more questions!</p>
          <Button
            onClick={onGetMore}
            disabled={isLoading}
            aria-label={`Draw ${drawCount} More`}
          >
            <ImportIcon className="mr-2" />
            Draw {drawCount} More
          </Button>
          <div className="flex flex-col items-center gap-2">
            <Slider
              id="draw-count"
              min={1}
              step={1}
              max={10}
              value={[drawCount]}
              onValueChange={handleDrawCountChange}
            />
            <Label htmlFor="draw-count">Draw Count</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={autoGetMore} 
              onCheckedChange={setAutoGetMore}
              id="auto-get-more"
            />
            <Label htmlFor="auto-get-more">Auto Draw</Label>
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
                  <QuestionCard question={card} advancedMode={advancedMode} />
                  {index === 0 && (
                    <>
                      <div
                        className={cn(
                          "absolute top-6 left-6 rounded-lg px-4 py-2 font-bold transform -rotate-12 opacity-0",
                          !advancedMode ? "bg-gray-500 text-white" : "bg-green-500 text-white",
                          "transition-opacity duration-200",
                          liking && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        {!advancedMode ? "NEXT" : "LIKE"}
                      </div>
                      <div
                        className={cn(
                          "absolute top-6 right-6 rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                          !advancedMode ? "bg-gray-500 text-white" : "bg-red-500 text-white",
                          "transition-opacity duration-200",
                          skipping && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        {!advancedMode ? "NEXT" : "SKIP"}
                      </div>
                      {advancedMode && <div
                        className={cn(
                          "absolute top-6 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 font-bold transform opacity-0",
                          "bg-blue-500 text-white",
                          "transition-opacity duration-200",
                          (filtering && direction === "down") && "opacity-100"
                        )}
                        aria-hidden="true"
                      >
                        FILTER
                      </div>
                      }
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