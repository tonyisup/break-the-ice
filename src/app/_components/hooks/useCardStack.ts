import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import type { Question } from "../types";
import { saveSkippedQuestion, saveLikedQuestion, clearSkippedQuestions, clearLikedQuestions } from "~/lib/localStorage";

// Constants
const DRAG_THRESHOLD = 10;
const SKIPPING_THRESHOLD = 100;

export type CardAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | null;

interface UseCardStackProps {
  initialQuestions: Question[];
  storedSkipIDs: string[];
  storedLikeIDs: string[];
}

interface UseCardStackReturn {
  cards: Question[];
  skips: string[];
  likes: string[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  isLoading: boolean;
  handleCardAction: (id: string, action: CardAction) => void;
  handleDrag: (info: PanInfo, id: string) => void;
  handleDragEnd: (info: PanInfo, id: string) => void;
  getMoreCards: () => Promise<void>;
  reset: () => void;
}


export function useCardStack({ initialQuestions, storedSkipIDs, storedLikeIDs }: UseCardStackProps): UseCardStackReturn {
  const [skips, setSkips] = useState<string[]>(storedSkipIDs);
  const [likes, setLikes] = useState<string[]>(storedLikeIDs);
  const [cards, setCards] = useState<Question[]>(() => {
    if (initialQuestions.length === 0) return [];
    if (storedSkipIDs.length === 0 && storedLikeIDs.length === 0) return initialQuestions;
    
    return initialQuestions.filter(question => 
      !storedSkipIDs.some(skip => skip === question.id) && 
      !storedLikeIDs.some(like => like === question.id)
    );
  });
  const [direction, setDirection] = useState<CardDirection>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    { 
      skipIds: skips, 
      likeIds: likes 
    },
    {
      enabled: false,
    }
  );

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

  const removeCard = useCallback((id: string) => {
    if (!id) return;  
    setDirection(null);
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleCardAction = useCallback((id: string, action: CardAction) => {
    if (!id) return;
    setDirection(action === 'like' ? 'right' : 'left');
    const question = cards.find((card) => card.id === id);
    if (question) {      
      // Save to local storage if the action is 'skip' (dislike)
      if (action === 'skip') {
        saveSkippedQuestion(question);
        setSkips((prev) => [question.id, ...prev]);
      } else if (action === 'like') {
        saveLikedQuestion(question);
        setLikes((prev) => [question.id, ...prev]);
      }
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
    
    if (info.offset.x > SKIPPING_THRESHOLD) {
      setLiking(true);
      setSkipping(false);
    } else if (info.offset.x < -SKIPPING_THRESHOLD) {
      setLiking(false);
      setSkipping(true);
    } else {
      setLiking(false);
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

  const reset = useCallback(() => {
    setSkips([]);
    setLikes([]);
    clearSkippedQuestions();
    clearLikedQuestions();
    setCards(initialQuestions);
  }, [initialQuestions]);

  return {
    cards,
    skips,
    likes,
    direction,
    skipping,
    liking,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    getMoreCards,
    reset,
  };
} 