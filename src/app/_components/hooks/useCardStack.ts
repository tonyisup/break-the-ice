import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
import { 
  saveSkippedQuestion, saveLikedQuestion, clearSkippedQuestions, clearLikedQuestions, 
  clearSkippedCategories, clearLikedCategories, clearSkippedTags, clearLikedTags,
  getBlockedCategories, getBlockedTags
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
  drawCountDefault: number;
  autoGetMoreDefault: boolean;
  advancedMode: boolean;
  initialQuestions: Question[];
  storedSkipIDs: number[];
  storedLikeIDs: number[];
  storedSkipCategories: string[];
  storedLikeCategories: string[];
  storedSkipTags: string[];
  storedLikeTags: string[];
  handleInspectCard: () => void;
}

interface UseCardStackReturn {
  cards: Question[];
  skips: number[];
  likes: number[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  filtering: boolean;
  isLoading: boolean;
  autoGetMore: boolean;
  drawCount: number;
  setDrawCount: (drawCount: number) => void;
  setAutoGetMore: (autoGetMore: boolean) => void;
  handleCardAction: (id: number, action: PreferenceAction) => void;
  handleDrag: (info: PanInfo, id: number) => void;
  handleDragEnd: (info: PanInfo, id: number) => void;
  getMoreCards: () => Promise<void>;
  reset: () => void;
}


export function useCardStack({ drawCountDefault, autoGetMoreDefault, advancedMode, initialQuestions, storedSkipIDs, storedLikeIDs, storedSkipCategories, storedLikeCategories, storedSkipTags, storedLikeTags, handleInspectCard }: UseCardStackProps): UseCardStackReturn {
  const [skips, setSkips] = useState<number[]>(storedSkipIDs);
  const [likes, setLikes] = useState<number[]>(storedLikeIDs);
  const [likesCategories] = useState<string[]>(storedLikeCategories);
  const [likesTags] = useState<string[]>(storedLikeTags);
  const [skipCategories] = useState<string[]>(storedSkipCategories);
  const [skipTags] = useState<string[]>(storedSkipTags);
  const [blockedCategories] = useState<string[]>(getBlockedCategories());
  const [blockedTags] = useState<string[]>(getBlockedTags());
  const [cards, setCards] = useState<Question[]>(initialQuestions);
  const [direction, setDirection] = useState<CardDirection | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoGetMore, setAutoGetMore] = useState(autoGetMoreDefault);
  const [drawCount, setDrawCount] = useState(drawCountDefault);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    {
      drawCount,
      skipIds: skips,
      likeIds: likes,
      skipCategories: skipCategories,
      likeCategories: likesCategories,
      skipTags: skipTags,
      likeTags: likesTags,
      blockedCategories: blockedCategories,
      blockedTags: blockedTags
    }
  );

  const { refetch: fetchSingleQuestion } = api.questions.getRandom.useQuery();

  const getMoreCards = async () => {
    console.log("Fetching more cards");
    setIsLoading(true);
    try {
      if (!advancedMode) {
        console.log("Fetching single question");
        const result = await fetchSingleQuestion();
        if (result.data) {
          setCards(result.data);
        }
      } else {
        console.log("Fetching new questions");
        const result = await fetchNewQuestions();
        console.log("Result", result);
        if (result.data) {
          setCards((prev) => [...prev, ...result.data]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch new questions:", error);
    } finally {
      setIsLoading(false);
    }
  }


  const handlerSetAutoGetMore = (checked: boolean) => {
    setAutoGetMore(checked);
    if (checked) {
      void getMoreCards();
    }
  }

  const removeCard = async (id: number) => {
    if (!id) return;
    setDirection(null);
    setLiking(false);
    setSkipping(false);
    setFiltering(false);

    setCards((prev) => prev.filter((card) => card.id !== id));

    if (cards.length <= 1) {
      await getMoreCards();
    }
  }

  const handleCardAction = useCallback((id: number, action: PreferenceAction) => {
    if (!id) return;
    setDirection(action === 'like' ? 'right' : 'left');
    const question = cards.find((card) => card.id === id);
    void removeCard(id);
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
  }, [cards, removeCard]);

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
      if (advancedMode) {
        void handleInspectCard();
      }
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
  }, [handleCardAction, handleInspectCard, advancedMode]);

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
    filtering,
    isLoading,
    autoGetMore,
    drawCount,
    setDrawCount,
    setAutoGetMore: handlerSetAutoGetMore,
    handleCardAction,
    handleDrag,
    handleDragEnd,
    getMoreCards,
    reset,
  };
} 