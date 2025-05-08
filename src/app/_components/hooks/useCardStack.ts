import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import { 
  clearSkippedTags, clearLikedTags,
  getBlockedTags
} from "~/lib/localStorage";
import type { Question as PrismaQuestion, Tag } from "@prisma/client";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};
// Constants
const X_DRAG_THRESHOLD = 10;
const Y_DRAG_THRESHOLD = 80;
const ACTION_THRESHOLD = 100;

export type PreferenceAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | 'up' | 'down' | null;

interface UseCardStackProps {
  initialQuestions: Question[];
  storedSkipTags: string[];
  storedLikeTags: string[];
}

interface UseCardStackReturn {
  cards: Question[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  filtering: boolean;
  isLoading: boolean;
  handleCardAction: (id: number, action: PreferenceAction) => void;
  handleDrag: (info: PanInfo, id: number) => void;
  handleDragEnd: (info: PanInfo, id: number) => void;
  getMoreCards: () => Promise<void>;
  reset: () => void;
}


export function useCardStack({ initialQuestions, storedSkipTags, storedLikeTags }: UseCardStackProps): UseCardStackReturn {
  const [likesTags] = useState<string[]>(storedLikeTags);
  const [skipTags] = useState<string[]>(storedSkipTags);
  const [blockedTags] = useState<string[]>(getBlockedTags());
  const [cards, setCards] = useState<Question[]>(initialQuestions);
  const [direction, setDirection] = useState<CardDirection | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    {
      skipTags: skipTags,
      likeTags: likesTags,
      blockedTags: blockedTags
    }
  );

  const getMoreCards = useCallback(async () => {
    console.log("Fetching more cards");
    setIsLoading(true);
    try {
      console.log("Fetching new questions");
      const result = await fetchNewQuestions();
      console.log("Result", result);
      if (result.data) {
        setCards((prev) => [...prev, ...result.data]);
      }
    } catch (error) {
      console.error("Failed to fetch new questions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchNewQuestions]);


  const removeCard = useCallback(async (id: number) => {
    if (!id) return;
    setDirection(null);
    setLiking(false);
    setSkipping(false);
    setFiltering(false);

    setCards((prev) => prev.filter((card) => card.id !== id));

    if (cards.length <= 1) {
      await getMoreCards();
    }
  }, [cards, getMoreCards]);

  const handleCardAction = useCallback((id: number, action: PreferenceAction) => {
    if (!id) return;
    setDirection(action === 'like' ? 'right' : 'left');
    void removeCard(id);
  }, [removeCard]);

  const handleDrag = useCallback((info: PanInfo, id: number) => {
    if (!id) return;
    if (info.offset.x > X_DRAG_THRESHOLD) {
      setDirection("right");
    } else if (info.offset.x < -X_DRAG_THRESHOLD) {
      setDirection("left");
    }
    if (info.offset.y > Y_DRAG_THRESHOLD) {
      setDirection("down");
    } else if (info.offset.y < -Y_DRAG_THRESHOLD) {
      setDirection("up");
    }
    if (info.offset.x > X_DRAG_THRESHOLD) {
      setLiking(true);
      setSkipping(false);
      setFiltering(false);
    } else if (info.offset.x < -X_DRAG_THRESHOLD) {
      setLiking(false);
      setSkipping(true);
      setFiltering(false);
    } else {
      setLiking(false);
      setSkipping(false);
      setFiltering(false);
    }
    if (info.offset.y > Y_DRAG_THRESHOLD) {
      setLiking(false);
      setSkipping(false);
      setFiltering(true);
    } else if (info.offset.y < -Y_DRAG_THRESHOLD) {
      setLiking(false);
      setSkipping(false);
      setFiltering(true);
    } else {
      setFiltering(false);
    }
  }, []);

  const handleDragEnd = useCallback((info: PanInfo, id: number) => {
    if (!id) return;
    if (info.offset.x > ACTION_THRESHOLD) {
      void handleCardAction(id, 'like');
    } else if (info.offset.x < -ACTION_THRESHOLD) {
      void handleCardAction(id, 'skip');
    } else if (info.offset.y > ACTION_THRESHOLD) {
      setDirection(null);
      setLiking(false);
      setSkipping(false);
      setFiltering(false);
    } else if (info.offset.y < -ACTION_THRESHOLD) {
      // removeCard(id);
      setDirection(null);
      setLiking(false);
      setSkipping(false);
      setFiltering(false);
    }
  }, [handleCardAction]);

  const reset = useCallback(() => {
    clearSkippedTags();
    clearLikedTags();
  }, []);

  return {
    cards,
    direction,
    skipping,
    liking,
    filtering,
    isLoading,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    getMoreCards,
    reset,
  };
} 