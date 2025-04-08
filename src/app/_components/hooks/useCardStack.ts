import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import type { Question } from "../types";
import type { RouterOutputs } from "~/trpc/react";

// Constants
const DRAG_THRESHOLD = 10;
const SKIPPING_THRESHOLD = 100;
const CARD_STACK_LIMIT = 2;

export type CardAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | null;

interface UseCardStackProps {
  initialQuestions: Question[];
}

interface UseCardStackReturn {
  cards: Question[];
  cardHistory: Question[];
  direction: CardDirection;
  skipping: boolean;
  isLoading: boolean;
  handleCardAction: (id: string, action: CardAction) => void;
  handleDrag: (info: PanInfo, id: string) => void;
  handleDragEnd: (info: PanInfo, id: string) => void;
  goBack: () => void;
  getMoreCards: () => Promise<void>;
}

type QuestionStack = RouterOutputs["questions"]["getRandomStack"];

export function useCardStack({ initialQuestions }: UseCardStackProps): UseCardStackReturn {
  const [cardHistory, setCardHistory] = useState<Question[]>([]);
  const [cards, setCards] = useState<Question[]>(initialQuestions);
  const [direction, setDirection] = useState<CardDirection>(null);
  const [skipping, setSkipping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    { discardPile: cardHistory },
    {
      enabled: false,
    }
  );

  const goBack = useCallback(() => {
    const latestCard = cardHistory[cardHistory.length - 1];
    setCardHistory((prev) => prev.slice(0, -1));
    if (latestCard) {
      setCards((prev) => [latestCard, ...prev]);
    }
  }, [cardHistory]);

  const removeCard = useCallback((id: string) => {
    if (!id) return;  
    setDirection(null);
    setCards((prev) => {
      const newCards = prev.filter((card) => card.id !== id);

      if (newCards.length === CARD_STACK_LIMIT) {
        getMoreCards().catch((error) => {
          console.error("Failed to get more cards:", error);
        });
      }

      return newCards;
    });
  }, []);

  const handleCardAction = useCallback((id: string, action: CardAction) => {
    if (!id) return;
    setDirection(action === 'like' ? 'right' : 'left');
    const question = cards.find((card) => card.id === id);
    if (question) {
      setCardHistory((prev) => [...prev, question]);
    }
    removeCard(id);
  }, [cards, removeCard]);

  const handleDrag = useCallback((info: PanInfo, id: string) => {
    if (!id) return;
    if (info.offset.x > DRAG_THRESHOLD) {
      setDirection("right");
    } else if (info.offset.x < -DRAG_THRESHOLD) {
      setDirection("left");
    }
    
    if (Math.abs(info.offset.x) > SKIPPING_THRESHOLD) {
      setSkipping(true);
    } else {
      setSkipping(false);
    }
  }, []);

  const handleDragEnd = useCallback((info: PanInfo, id: string) => {
    if (!id) return;
    if (info.offset.x > SKIPPING_THRESHOLD) {
      handleCardAction(id, 'like');
    } else if (info.offset.x < -SKIPPING_THRESHOLD) {
      handleCardAction(id, 'skip');
    } else {
      setDirection(null);
    }
  }, [handleCardAction]);

  const getMoreCards = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchNewQuestions();
      if (result.data) {
        const newQuestions = result.data;
        setCards((prev) => [...prev, ...newQuestions]);
      }
    } catch (error) {
      console.error("Failed to fetch new questions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchNewQuestions]);

  return {
    cards,
    cardHistory,
    direction,
    skipping,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    goBack,
    getMoreCards,
  };
} 