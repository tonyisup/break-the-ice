import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import type { Question } from "../types";
import { saveSkippedQuestion, saveLikedQuestion, removeLikedQuestion, removeSkippedQuestion, clearSkippedQuestions, clearLikedQuestions } from "~/lib/localStorage";

// Constants
const DRAG_THRESHOLD = 10;
const SKIPPING_THRESHOLD = 100;
const CARD_STACK_LIMIT = 2;

export type CardAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | null;

interface UseCardStackProps {
  initialQuestions: Question[];
  storedSkips: Question[];
  storedLikes: Question[];
}

interface UseCardStackReturn {
  cards: Question[];
  skips: Question[];
  likes: Question[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  isLoading: boolean;
  handleCardAction: (id: string, action: CardAction) => void;
  handleDrag: (info: PanInfo, id: string) => void;
  handleDragEnd: (info: PanInfo, id: string) => void;
  undoSkip: () => void;
  redoLike: () => void;
  getMoreCards: () => Promise<void>;
  reset: () => void;
}


export function useCardStack({ initialQuestions, storedSkips, storedLikes }: UseCardStackProps): UseCardStackReturn {
  const [skips, setSkips] = useState<Question[]>(storedSkips);
  const [likes, setLikes] = useState<Question[]>(storedLikes);
  const [cards, setCards] = useState<Question[]>(() => {
    if (initialQuestions.length === 0) return [];
    if (storedSkips.length === 0 && storedLikes.length === 0) return initialQuestions;
    
    return initialQuestions.filter(question => 
      !storedSkips.some(skip => skip.id === question.id) && 
      !storedLikes.some(like => like.id === question.id)
    );
  });
  const [direction, setDirection] = useState<CardDirection>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    { 
      skipIds: skips.map(q => q.id), 
      likeIds: likes.map(q => q.id) 
    },
    {
      enabled: false,
    }
  );

  const undoSkip = useCallback(() => {
    const latestCard = skips[skips.length - 1];
    setSkips((prev) => prev.slice(0, -1));
    if (latestCard) {
      setCards((prev) => [latestCard, ...prev]);
      removeSkippedQuestion(latestCard.id);
    }
  }, [skips]);

  const redoLike = useCallback(() => {
    const latestCard = likes[likes.length - 1];
    setLikes((prev) => prev.slice(0, -1));
    if (latestCard) { 
      setCards((prev) => [latestCard, ...prev]);
      removeLikedQuestion(latestCard.id);
    }
  }, [likes]);


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
        setSkips((prev) => [question, ...prev]);
      } else if (action === 'like') {
        saveLikedQuestion(question);
        setLikes((prev) => [question, ...prev]);
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
    undoSkip,
    redoLike,
    getMoreCards,
    reset,
  };
} 