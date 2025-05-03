import { useState, useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { api } from "~/trpc/react";
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

// LocalStorage Keys
const SKIPPED_IDS_KEY = "break-the-ice-skipped-ids";
const LIKED_IDS_KEY = "break-the-ice-liked-ids";
const SKIPPED_TAGS_KEY = "break-the-ice-skipped-tags";
const LIKED_TAGS_KEY = "break-the-ice-liked-tags";
const SKIPPED_CATEGORIES_KEY = "break-the-ice-skipped-categories";
const LIKED_CATEGORIES_KEY = "break-the-ice-liked-categories";
const ADVANCED_MODE_KEY = "break-the-ice-advanced-mode";
const AUTO_GET_MORE_KEY = "break-the-ice-auto-get-more";
const DRAW_COUNT_KEY = "break-the-ice-draw-count";
const BLOCKED_CATEGORIES_KEY = "break-the-ice-blocked-categories";
const BLOCKED_TAGS_KEY = "break-the-ice-blocked-tags";

export type PreferenceAction = 'like' | 'skip';
export type CardDirection = 'left' | 'right' | 'up' | 'down' | null;

interface UseCardStackProps {
  drawCountDefault: number;
  autoGetMoreDefault: boolean;
  advancedMode: boolean;
  initialQuestions: Question[];
  handleInspectCard: () => void;
}

interface UseCardStackReturn {
  // Card stack state
  cards: Question[];
  direction: CardDirection;
  skipping: boolean;
  liking: boolean;
  filtering: boolean;
  isLoading: boolean;
  
  // Preferences state
  skips: number[];
  likes: number[];
  skipCategories: string[];
  likeCategories: string[];
  skipTags: string[];
  likeTags: string[];
  blockedCategories: string[];
  blockedTags: string[];
  
  // Settings state
  autoGetMore: boolean;
  drawCount: number;
  
  // Card actions
  handleCardAction: (id: number, action: PreferenceAction) => void;
  handleDrag: (info: PanInfo, id: number) => void;
  handleDragEnd: (info: PanInfo, id: number) => void;
  getMoreCards: () => Promise<void>;
  
  // Settings actions
  setDrawCount: (drawCount: number) => void;
  setAutoGetMore: (autoGetMore: boolean) => void;
  
  // Preference actions
  saveSkippedQuestion: (question: Question) => void;
  saveLikedQuestion: (question: Question) => void;
  saveSkippedTag: (tag: string) => void;
  saveLikedTag: (tag: string) => void;
  saveSkippedCategory: (category: string) => void;
  saveLikedCategory: (category: string) => void;
  saveBlockedCategory: (category: string) => void;
  saveBlockedTag: (tag: string) => void;
  
  // Removal actions
  removeSkippedQuestion: (questionId: number) => void;
  removeLikedQuestion: (questionId: number) => void;
  removeSkippedTag: (tag: string) => void;
  removeLikedTag: (tag: string) => void;
  removeSkippedCategory: (category: string) => void;
  removeLikedCategory: (category: string) => void;
  removeBlockedCategory: (category: string) => void;
  removeBlockedTag: (tag: string) => void;
  
  // Clear actions
  clearSkippedQuestions: () => void;
  clearLikedQuestions: () => void;
  clearSkippedCategories: () => void;
  clearLikedCategories: () => void;
  clearSkippedTags: () => void;
  clearLikedTags: () => void;
  
  // Advanced mode actions
  saveAdvancedMode: (advancedMode: boolean) => void;
  getAdvancedMode: () => boolean;
  
  // Reset
  reset: () => void;
}

export function useCardStack({ 
  drawCountDefault, 
  autoGetMoreDefault, 
  advancedMode, 
  initialQuestions, 
  handleInspectCard 
}: UseCardStackProps): UseCardStackReturn {
  // Card stack state
  const [cards, setCards] = useState<Question[]>(initialQuestions);
  const [direction, setDirection] = useState<CardDirection | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [liking, setLiking] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Preferences state
  const [skips, setSkips] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const skippedIds = localStorage.getItem(SKIPPED_IDS_KEY);
      return skippedIds ? JSON.parse(skippedIds) : [];
    } catch (error) {
      console.error("Failed to get skipped IDs from local storage:", error);
      return [];
    }
  });
  
  const [likes, setLikes] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const likedIds = localStorage.getItem(LIKED_IDS_KEY);
      return likedIds ? JSON.parse(likedIds) : [];
    } catch (error) {
      console.error("Failed to get liked IDs from local storage:", error);
      return [];
    }
  });
  
  const [skipCategories, setSkipCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(SKIPPED_CATEGORIES_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get skipped categories from local storage:", error);
      return [];
    }
  });
  
  const [likeCategories, setLikeCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(LIKED_CATEGORIES_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get liked categories from local storage:", error);
      return [];
    }
  });
  
  const [skipTags, setSkipTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(SKIPPED_TAGS_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get skipped tags from local storage:", error);
      return [];
    }
  });
  
  const [likeTags, setLikeTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(LIKED_TAGS_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get liked tags from local storage:", error);
      return [];
    }
  });
  
  const [blockedCategories, setBlockedCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(BLOCKED_CATEGORIES_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get blocked categories from local storage:", error);
      return [];
    }
  });
  
  const [blockedTags, setBlockedTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedData = localStorage.getItem(BLOCKED_TAGS_KEY);
      return storedData ? JSON.parse(storedData) : [];
    } catch (error) {
      console.error("Failed to get blocked tags from local storage:", error);
      return [];
    }
  });
  
  // Settings state
  const [autoGetMore, setAutoGetMore] = useState(autoGetMoreDefault);
  const [drawCount, setDrawCount] = useState(drawCountDefault);

  const { refetch: fetchNewQuestions } = api.questions.getRandomStack.useQuery(
    {
      drawCount,
      skipIds: skips,
      likeIds: likes,
      skipCategories: skipCategories,
      likeCategories: likeCategories,
      skipTags: skipTags,
      likeTags: likeTags,
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

  const handlerSetAutoGetMore = async (checked: boolean) => {
    setAutoGetMore(checked);
    if (checked) {
      await getMoreCards();
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

  const handleCardAction = async (id: number, action: PreferenceAction) => {
    if (!id) return;
    setDirection(action === 'like' ? 'right' : 'left');
    const question = cards.find((card) => card.id === id);
    await removeCard(id);
    if (question) {
      if (action === 'skip') {
        saveSkippedQuestion(question);
        setSkips((prev) => [question.id, ...prev]);
      } else if (action === 'like') {
        saveLikedQuestion(question);
        setLikes((prev) => [question.id, ...prev]);
      }
    }
  }

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
      handleCardAction(id, 'like');
    } else if (info.offset.x < -ACTION_THRESHOLD) {
      handleCardAction(id, 'skip');
    } else if (info.offset.y > ACTION_THRESHOLD) {
      if (advancedMode) {
        handleInspectCard();
      }
      setDirection(null);
      setLiking(false);
      setSkipping(false);
      setFiltering(false);
    } else if (info.offset.y < -ACTION_THRESHOLD) {
      setDirection(null);
      setLiking(false);
      setSkipping(false);
      setFiltering(false);
    }
  }, [handleCardAction, handleInspectCard, advancedMode]);

  // LocalStorage methods
  const saveSkippedQuestion = useCallback((question: Question) => {
    if (typeof window === "undefined") return;
    try {
      if (!skips.includes(question.id)) {
        const updatedSkips = [question.id, ...skips];
        setSkips(updatedSkips);
        localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify(updatedSkips));
      }
    } catch (error) {
      console.error("Failed to save skipped question to local storage:", error);
    }
  }, [skips]);

  const saveLikedQuestion = useCallback((question: Question) => {
    if (typeof window === "undefined") return;
    try {
      if (!likes.includes(question.id)) {
        const updatedLikes = [question.id, ...likes];
        setLikes(updatedLikes);
        localStorage.setItem(LIKED_IDS_KEY, JSON.stringify(updatedLikes));
      }
    } catch (error) {
      console.error("Failed to save liked question to local storage:", error);
    }
  }, [likes]);

  const saveSkippedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!skipTags.includes(tag)) {
        const updatedTags = [tag, ...skipTags];
        setSkipTags(updatedTags);
        localStorage.setItem(SKIPPED_TAGS_KEY, JSON.stringify(updatedTags));
      }
    } catch (error) {
      console.error("Failed to save skipped tag to local storage:", error);
    }
  }, [skipTags]);

  const saveLikedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!likeTags.includes(tag)) {
        const updatedTags = [tag, ...likeTags];
        setLikeTags(updatedTags);
        localStorage.setItem(LIKED_TAGS_KEY, JSON.stringify(updatedTags));
      }
    } catch (error) {
      console.error("Failed to save liked tag to local storage:", error);
    }
  }, [likeTags]);

  const saveSkippedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!skipCategories.includes(category)) {
        const updatedCategories = [category, ...skipCategories];
        setSkipCategories(updatedCategories);
        localStorage.setItem(SKIPPED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
      }
    } catch (error) {
      console.error("Failed to save skipped category to local storage:", error);
    }
  }, [skipCategories]);

  const saveLikedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!likeCategories.includes(category)) {
        const updatedCategories = [category, ...likeCategories];
        setLikeCategories(updatedCategories);
        localStorage.setItem(LIKED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
      }
    } catch (error) {
      console.error("Failed to save liked category to local storage:", error);
    }
  }, [likeCategories]);

  const saveBlockedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!blockedCategories.includes(category)) {
        const updatedCategories = [category, ...blockedCategories];
        setBlockedCategories(updatedCategories);
        localStorage.setItem(BLOCKED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
      }
    } catch (error) {
      console.error("Failed to save blocked category to local storage:", error);
    }
  }, [blockedCategories]);

  const saveBlockedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!blockedTags.includes(tag)) {
        const updatedTags = [tag, ...blockedTags];
        setBlockedTags(updatedTags);
        localStorage.setItem(BLOCKED_TAGS_KEY, JSON.stringify(updatedTags));
      }
    } catch (error) {
      console.error("Failed to save blocked tag to local storage:", error);
    }
  }, [blockedTags]);

  const removeSkippedQuestion = useCallback((questionId: number) => {
    if (typeof window === "undefined") return;
    try {
      const updatedSkips = skips.filter(id => id !== questionId);
      setSkips(updatedSkips);
      localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify(updatedSkips));
    } catch (error) {
      console.error("Failed to remove skipped question from local storage:", error);
    }
  }, [skips]);

  const removeLikedQuestion = useCallback((questionId: number) => {
    if (typeof window === "undefined") return;
    try {
      const updatedLikes = likes.filter(id => id !== questionId);
      setLikes(updatedLikes);
      localStorage.setItem(LIKED_IDS_KEY, JSON.stringify(updatedLikes));
    } catch (error) {
      console.error("Failed to remove liked question from local storage:", error);
    }
  }, [likes]);

  const removeSkippedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedTags = skipTags.filter(t => t !== tag);
      setSkipTags(updatedTags);
      localStorage.setItem(SKIPPED_TAGS_KEY, JSON.stringify(updatedTags));
    } catch (error) {
      console.error("Failed to remove skipped tag from local storage:", error);
    }
  }, [skipTags]);

  const removeLikedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedTags = likeTags.filter(t => t !== tag);
      setLikeTags(updatedTags);
      localStorage.setItem(LIKED_TAGS_KEY, JSON.stringify(updatedTags));
    } catch (error) {
      console.error("Failed to remove liked tag from local storage:", error);
    }
  }, [likeTags]);

  const removeSkippedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedCategories = skipCategories.filter(c => c !== category);
      setSkipCategories(updatedCategories);
      localStorage.setItem(SKIPPED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
    } catch (error) {
      console.error("Failed to remove skipped category from local storage:", error);
    }
  }, [skipCategories]);

  const removeLikedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedCategories = likeCategories.filter(c => c !== category);
      setLikeCategories(updatedCategories);
      localStorage.setItem(LIKED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
    } catch (error) {
      console.error("Failed to remove liked category from local storage:", error);
    }
  }, [likeCategories]);

  const removeBlockedCategory = useCallback((category: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedCategories = blockedCategories.filter(c => c !== category);
      setBlockedCategories(updatedCategories);
      localStorage.setItem(BLOCKED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
    } catch (error) {
      console.error("Failed to remove blocked category from local storage:", error);
    }
  }, [blockedCategories]);

  const removeBlockedTag = useCallback((tag: string) => {
    if (typeof window === "undefined") return;
    try {
      const updatedTags = blockedTags.filter(t => t !== tag);
      setBlockedTags(updatedTags);
      localStorage.setItem(BLOCKED_TAGS_KEY, JSON.stringify(updatedTags));
    } catch (error) {
      console.error("Failed to remove blocked tag from local storage:", error);
    }
  }, [blockedTags]);

  const clearSkippedQuestions = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setSkips([]);
      localStorage.removeItem(SKIPPED_IDS_KEY);
    } catch (error) {
      console.error("Failed to clear skipped questions from local storage:", error);
    }
  }, []);

  const clearLikedQuestions = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setLikes([]);
      localStorage.removeItem(LIKED_IDS_KEY);
    } catch (error) {
      console.error("Failed to clear liked questions from local storage:", error);
    }
  }, []);

  const clearSkippedCategories = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setSkipCategories([]);
      localStorage.removeItem(SKIPPED_CATEGORIES_KEY);
    } catch (error) {
      console.error("Failed to clear skipped categories from local storage:", error);
    }
  }, []);

  const clearLikedCategories = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setLikeCategories([]);
      localStorage.removeItem(LIKED_CATEGORIES_KEY);
    } catch (error) {
      console.error("Failed to clear liked categories from local storage:", error);
    }
  }, []);

  const clearSkippedTags = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setSkipTags([]);
      localStorage.removeItem(SKIPPED_TAGS_KEY);
    } catch (error) {
      console.error("Failed to clear skipped tags from local storage:", error);
    }
  }, []);

  const clearLikedTags = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      setLikeTags([]);
      localStorage.removeItem(LIKED_TAGS_KEY);
    } catch (error) {
      console.error("Failed to clear liked tags from local storage:", error);
    }
  }, []);

  const saveAdvancedMode = useCallback((advancedMode: boolean) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(ADVANCED_MODE_KEY, JSON.stringify(advancedMode));
    } catch (error) {
      console.error("Failed to save advanced mode to local storage:", error);
    }
  }, []);

  const getAdvancedMode = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      const storedData = localStorage.getItem(ADVANCED_MODE_KEY);
      return storedData ? JSON.parse(storedData) : false;
    } catch (error) {
      console.error("Failed to get advanced mode from local storage:", error);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    clearSkippedQuestions();
    clearLikedQuestions();
    clearSkippedCategories();
    clearLikedCategories();
    clearSkippedTags();
    clearLikedTags();
  }, [clearSkippedQuestions, clearLikedQuestions, clearSkippedCategories, clearLikedCategories, clearSkippedTags, clearLikedTags]);

  return {
    // Card stack state
    cards,
    direction,
    skipping,
    liking,
    filtering,
    isLoading,
    
    // Preferences state
    skips,
    likes,
    skipCategories,
    likeCategories,
    skipTags,
    likeTags,
    blockedCategories,
    blockedTags,
    
    // Settings state
    autoGetMore,
    drawCount,
    
    // Card actions
    handleCardAction,
    handleDrag,
    handleDragEnd,
    getMoreCards,
    
    // Settings actions
    setDrawCount,
    setAutoGetMore: handlerSetAutoGetMore,
    
    // Preference actions
    saveSkippedQuestion,
    saveLikedQuestion,
    saveSkippedTag,
    saveLikedTag,
    saveSkippedCategory,
    saveLikedCategory,
    saveBlockedCategory,
    saveBlockedTag,
    
    // Removal actions
    removeSkippedQuestion,
    removeLikedQuestion,
    removeSkippedTag,
    removeLikedTag,
    removeSkippedCategory,
    removeLikedCategory,
    removeBlockedCategory,
    removeBlockedTag,
    
    // Clear actions
    clearSkippedQuestions,
    clearLikedQuestions,
    clearSkippedCategories,
    clearLikedCategories,
    clearSkippedTags,
    clearLikedTags,
    
    // Advanced mode actions
    saveAdvancedMode,
    getAdvancedMode,
    
    // Reset
    reset,
  };
} 