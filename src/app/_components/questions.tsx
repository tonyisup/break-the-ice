"use client";

import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { QuestionCard } from "./questionCard";
import { Button } from "~/components/ui/button";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { HeartIcon, RedoIcon, ShuffleIcon, SkipForwardIcon, Undo, UndoIcon, XIcon } from "lucide-react";

type Question = NonNullable<RouterOutputs["questions"]["getRandom"]>;

export function QuestionComponent({ 
  initialQuestions 
}: { 
  initialQuestions: Question[];
}) {
  const [undoHistory, setUndoHistory] = useState<Question[]>([]);
  const [cardHistory, setCardHistory] = useState<Question[]>([]);
  const [cards, setCards] = useState(initialQuestions);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    undefined,
    {
      enabled: false,
    }
  );

  const goBack = () => {
    //get the latest card from cardHistory
    const latestCard = cardHistory[cardHistory.length - 1];
    //pop the latest card from cardHistory
    setCardHistory((prev) => prev.slice(0, -1));
    //add the card to the top of cards
    if (latestCard) {
      setCards((prev) => [latestCard, ...prev]);
    }
  };

  const likeCard = (id: string) => {
    if (!id) return;
    setDirection("right");
    const question = cards.find((card) => card.id === id);
    if (question) {
      setCardHistory((prev) => [...prev, question]);
    }
    removeCard(id);
  };

  const skipCard = (id: string) => {
    if (!id) return;
    setDirection("left");
    const question = cards.find((card) => card.id === id);
    if (question) {
      setUndoHistory((prev) => [...prev, question]);
    }
    removeCard(id);
  };

  const removeCard = (id: string) => {
    if (!id) return;  
    setDirection(null);
    setCards((prev) => prev.filter((card) => card.id !== id));
  };

  const handleDrag = (info: PanInfo, id: string) => {
    if (!id) return;
    const threshold = 10;
    if (info.offset.x > threshold) {
      setDirection("right");
    } else if (info.offset.x < -threshold) {
      setDirection("left");
    }
  };

  const handleDragEnd = (info: PanInfo, id: string) => {
    if (!id) return;
    const threshold = 100;
    if (info.offset.x > threshold) {
      likeCard(id);
    } else if (info.offset.x < -threshold) {
      skipCard(id);
    } else {
      setDirection(null);
    }
  };

  const getMoreCards = async () => {
    const newQuestions = await fetchNewQuestions();
    if (newQuestions.data) {
      setCards((prev) => [...newQuestions.data, ...prev]);
    }
  };

  return (
    <div className="flex-1 p-8 h-full flex flex-col justify-center items-center">
      <div className="flex-1 w-[280px] h-[480px]">
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
                    height: "420px",
                    zIndex: cards.length - index,
                    top: index * 4,
                    left: index * 2,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                    transformOrigin: "bottom center",
                  }}
                  drag={index === 0}
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.9}
                  onDrag={(_, info: PanInfo) => handleDrag(info, card.id)}
                  onDragEnd={(_, info: PanInfo) => handleDragEnd(info, card.id)}
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
                >
                  <div className="h-full">
                    <QuestionCard question={card} />
                    {index === 0 && (
                      <>
                        <div
                          className={cn(
                            "absolute top-6 left-6  rounded-lg px-4 py-2 font-bold transform -rotate-12 opacity-0",
                            "transition-opacity duration-200",
                            direction === "left" && "opacity-100"
                          )}
                        >
                          SKIP
                        </div>
                        <div
                          className={cn(
                            "absolute top-6 right-6  rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                            "transition-opacity duration-200",
                            direction === "right" && "opacity-100"
                          )}
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

      <div className="flex justify-center gap-8">
        {cards && cards.length === 0 ? (
            <div className="text-center">
              <p className="text-xl mb-4">No more questions!</p>
              <Button onClick={getMoreCards}>
                Get More Questions
              </Button>
            </div>
          ) : (
          <div className="flex justify-center gap-8">
            
            <Button
              onClick={() => goBack()}
            >
              <UndoIcon className="w-4 h-4" />
              Previous
              {undoHistory.length > 0 && (
                <span className="ml-2 bg-yellow-600 text-xs rounded-full px-2 py-0.5">
                  {undoHistory.length}
                </span>
              )}
            </Button>
          <Button
            onClick={() => skipCard(cards[0]?.id ?? "")}
          >
            <ShuffleIcon className="w-4 h-4" />
            Random
          </Button>
            {/* <Button
              className="bg-blue-800 text-white"
              onClick={goBack}
            >
              <RedoIcon className="w-4 h-4" /> 
              Likes
              {cardHistory.length > 0 && (
                <span className="ml-2 bg-blue-600 text-xs rounded-full px-2 py-0.5">
                  {cardHistory.length}
                </span>
              )}
            </Button>
            <Button
              className="bg-green-800 text-white"
              onClick={() => likeCard(cards[0]?.id ?? "")}
            >
              <HeartIcon className="w-4 h-4" />
              Like
            </Button>
            <Button
              className="bg-red-800 text-white"
              onClick={() => skipCard(cards[0]?.id ?? "")}
            >
              <XIcon className="w-4 h-4" />
              Skip
            </Button>
            <Button
              className="bg-yellow-800 text-white"
              onClick={() => goBack()}
            >
              <UndoIcon className="w-4 h-4" />
              Undo
              {undoHistory.length > 0 && (
                <span className="ml-2 bg-yellow-600 text-xs rounded-full px-2 py-0.5">
                  {undoHistory.length}
                </span>
              )}
            </Button> */}
          </div>
        )}
      </div>
    </div>
  );
} 