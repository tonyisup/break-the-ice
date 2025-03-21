"use client";

import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { cn } from "~/lib/utils";
import { api, RouterOutputs } from "~/trpc/react";
import { QuestionCard } from "./questionCard";
import { Button } from "~/components/ui/button";

type Question = NonNullable<RouterOutputs["questions"]["getRandom"]>;

export function QuestionComponent({ 
  initialQuestions 
}: { 
  initialQuestions: Question[];
}) {
  const [cardHistory, setCardHistory] = useState<Question[]>([]);
  const [cards, setCards] = useState(initialQuestions);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  const { refetch: fetchOneQuestion } = api.questions.getRandom.useQuery(
    undefined,
    {
      enabled: false,
    }
  );
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
    removeCard(id);
  };

  const removeCard = async (id: string) => {
    if (!id) return;  
    setDirection(null);
    setCards((prev) => prev.filter((card) => card.id !== id));
    //fetch a new question
/*     const newQuestion = await fetchOneQuestion();
    if (newQuestion.data) {
      setCards((prev) => [newQuestion.data as Question, ...prev]);
    } */
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
                  onDrag={(_, info) => handleDrag(info, card.id)}
                  onDragEnd={(_, info) => handleDragEnd(info, card.id)}
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
                            "absolute top-6 left-6 bg-red-500 text-white rounded-lg px-4 py-2 font-bold transform -rotate-12 opacity-0",
                            "transition-opacity duration-200",
                            direction === "left" && "opacity-100"
                          )}
                        >
                          SKIP
                        </div>
                        <div
                          className={cn(
                            "absolute top-6 right-6 bg-green-500 text-white rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                            "transition-opacity duration-200",
                            direction === "right" && "opacity-100"
                          )}
                        >
                          LIKE
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
              onClick={() => skipCard(cards[0]?.id ?? "")}
            >
              Skip
            </Button>
            <Button
              onClick={() => likeCard(cards[0]?.id ?? "")}
            >
              Like
            </Button>
            <Button
              onClick={goBack}
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
} 