import { useState, useCallback, useEffect } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import type { Question } from "@prisma/client";
import { saveSkippedQuestion, saveLikedQuestion, clearSkippedQuestions, clearLikedQuestions, clearSkippedCategories, clearLikedCategories, clearSkippedTags, clearLikedTags } from "~/lib/localStorage";

// Constants
const DRAG_THRESHOLD = 10;
const SKIPPING_THRESHOLD = 100;

export type PreferenceAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | null;

interface UseCardStackProps {
  storedSkipIDs: number[];
  storedLikeIDs: number[];
  storedSkipCategories: string[];
  storedLikeCategories: string[];
  storedSkipTags: string[];
  storedLikeTags: string[];
}

interface UseCardStackReturn {
  cards: Question[];
  skips: number[];
  likes: number[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  isLoading: boolean;
  handleCardAction: (id: number, action: PreferenceAction) => void;
  handleDrag: (info: PanInfo, id: number) => void;
  handleDragEnd: (info: PanInfo, id: number) => void;
  getMoreCards: () => Promise<void>;
  reset: () => void;
}


export function useCardStack({ storedSkipIDs, storedLikeIDs, storedSkipCategories, storedLikeCategories, storedSkipTags, storedLikeTags }: UseCardStackProps): UseCardStackReturn {
  const [skips, setSkips] = useState<number[]>(storedSkipIDs);
  const [likes, setLikes] = useState<number[]>(storedLikeIDs);
  const [likesCategories] = useState<string[]>(storedLikeCategories);
  const [likesTags] = useState<string[]>(storedLikeTags);
  const [skipCategories] = useState<string[]>(storedSkipCategories);
  const [skipTags] = useState<string[]>(storedSkipTags);
  const [cards, setCards] = useState<Question[]>([]);
  const [direction, setDirection] = useState<CardDirection | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

  const { data: newQuestions, refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    { 
      skipIds: skips, 
      likeIds: likes,
      skipCategories: skipCategories,
      likeCategories: likesCategories,
      skipTags: skipTags,
      likeTags: likesTags
    },
    {
      enabled: (cards.length === 0) && firstLoad,
    },
  );


  useEffect(() => {
    if (newQuestions) {
      setCards((prev) => [...prev, ...newQuestions]);
      setFirstLoad(false);
    }
  }, [newQuestions]);


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

  const removeCard = useCallback((id: number) => {
    if (!id) return;  
    setDirection(null);
    setCards((prev) => prev.filter((card) => card.id !== id));
  }, []);

  const handleCardAction = useCallback((id: number, action: PreferenceAction) => {
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

  const handleDrag = useCallback((info: PanInfo, id: number) => {
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

  const handleDragEnd = useCallback((info: PanInfo, id: number) => {
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
    clearSkippedCategories();
    clearLikedCategories();
    clearSkippedTags();
    clearLikedTags();
  }, []);

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