import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useStorageContext } from './useStorageContext';
import { useQuestionHistory } from './useQuestionHistory';

interface QuestionStateContextType {
  styles: Doc<'styles'>[] | undefined;
  tones: Doc<'tones'>[] | undefined;
  selectedStyle: string;
  setSelectedStyle: (style: string) => void;
  selectedTone: string;
  setSelectedTone: (tone: string) => void;
  currentQuestion: Doc<'questions'> | null;
  isGenerating: boolean;
  isShuffling: boolean;
  isStyleTonesOpen: boolean;
  setIsStyleTonesOpen: (isOpen: boolean) => void;
  getNextQuestion: () => void;
  handleShuffleStyleAndTone: () => void;
  handleConfirmRandomizeStyleAndTone: () => void;
  handleCancelRandomizeStyleAndTone: () => void;
  toggleLike: (questionId: Id<'questions'>) => void;
  toggleHide: (questionId: Id<'questions'>) => void;
  handleHideStyle: (styleId: string) => void;
  handleHideTone: (toneId: string) => void;
  isFavorite: boolean;
  style: Doc<"styles"> | null | undefined;
  tone: Doc<"tones"> | null | undefined;
}

const QuestionStateContext = createContext<QuestionStateContextType | undefined>(undefined);

export const useQuestionState = () => {
  const context = useContext(QuestionStateContext);
  if (!context) {
    throw new Error('useQuestionState must be used within a QuestionStateProvider');
  }
  return context;
};

export const QuestionStateProvider = ({ children }: { children: ReactNode }) => {
  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    hiddenQuestions,
    addHiddenQuestion,
    hiddenStyles,
    hiddenTones,
    addHiddenStyle,
    addHiddenTone,
  } = useStorageContext();

  const styles = useQuery(api.styles.getFilteredStyles, { excluded: hiddenStyles });
  const tones = useQuery(api.tones.getFilteredTones, { excluded: hiddenTones });

  const { questionHistory, addQuestionHistoryEntry } = useQuestionHistory();
  const [startTime, setStartTime] = useState(Date.now());
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStyle, setSelectedStyle] = useState(searchParams.get('style') ?? '');
  const [selectedTone, setSelectedTone] = useState(searchParams.get('tone') ?? '');
  const [isStyleTonesOpen, setIsStyleTonesOpen] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const isShufflingRef = useRef(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const callGenerateAIQuestionRef = useRef<((count: number, isShuffleGeneration?: boolean) => Promise<void>) | undefined>(undefined);
  const generateAIQuestion = useAction(api.ai.generateAIQuestion);
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const nextQuestions = useQuery(
    api.questions.getNextQuestions,
    selectedStyle === '' || selectedTone === ''
      ? 'skip'
      : {
          count: 10,
          style: selectedStyle,
          tone: selectedTone,
          seen: questionHistory.map((q) => q.question?._id),
          hidden: hiddenQuestions,
        }
  );
  const style = useQuery(api.styles.getStyle, selectedStyle === '' ? 'skip' : { id: selectedStyle });
  const tone = useQuery(api.tones.getTone, selectedTone === '' ? 'skip' : { id: selectedTone });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<'questions'>[]>([]);

  useEffect(() => {
    if (styles && styles.length > 0 && !selectedStyle) {
      setSelectedStyle(styles[0].id);
    }
    if (tones && tones.length > 0 && !selectedTone) {
      setSelectedTone(tones[0].id);
    }
  }, [styles, tones, selectedStyle, selectedTone]);

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('style', selectedStyle);
    newSearchParams.set('tone', selectedTone);
    setSearchParams(newSearchParams);
  }, [searchParams, selectedStyle, selectedTone, setSearchParams]);

  const callGenerateAIQuestion = useCallback(
    async (count: number, isShuffleGeneration = false) => {
      try {
        const newQuestions = await generateAIQuestion({
          style: selectedStyle,
          tone: selectedTone,
          selectedTags: [],
          count: count,
        });
        const validNewQuestions = newQuestions.filter((q): q is Doc<'questions'> => q !== null);
        if (validNewQuestions.length > 0) {
          setCurrentQuestions((prev) => {
            const updated = [...prev, ...validNewQuestions];
            if (isShuffleGeneration) {
              const timeout = setTimeout(() => {
                setIsShuffling(false);
              }, 0);
              timeoutRefs.current.push(timeout);
            }
            return updated;
          });
        }
      } catch (error) {
        console.error('Error generating AI questions:', error);
        toast.error('Failed to generate questions. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedStyle, selectedTone, generateAIQuestion]
  );

  useEffect(() => {
    callGenerateAIQuestionRef.current = callGenerateAIQuestion;
  }, [callGenerateAIQuestion]);

  useEffect(() => {
    try {
      if (nextQuestions) {
        if (nextQuestions.length > 0) {
          setCurrentQuestions((prevQuestions) => {
            const existingIds = new Set(prevQuestions.map((q) => q._id));
            const filteredNewQuestions = nextQuestions.filter((q) => !existingIds.has(q._id));
            if (filteredNewQuestions.length > 0) {
              return [...prevQuestions, ...filteredNewQuestions];
            }
            return prevQuestions;
          });
        } else if (currentQuestions.length === 0 && !isGenerating) {
          setIsGenerating(true);
          const count = isShuffling ? 1 : 2;
          void callGenerateAIQuestionRef.current?.(count, isShuffling);
        }
      }
    } catch (error) {
      console.error('Error in first useEffect:', error);
      setIsGenerating(false);
    }
  }, [nextQuestions, isGenerating, currentQuestions.length, isShuffling]);

  useEffect(() => {
    try {
      if (nextQuestions && nextQuestions.length > 1) {
        return;
      }
      if (isShufflingRef.current) {
        return;
      }
      if (isGenerating) {
        return;
      }
      if (currentQuestions.length > 0 && currentQuestions.length <= 5) {
        if (nextQuestions && nextQuestions.length === 0) {
          setIsGenerating(true);
        }
        const questionsToGenerate = 7 - currentQuestions.length;
        void callGenerateAIQuestion(questionsToGenerate, false);
      }
    } catch (error) {
      console.error('Error in second useEffect:', error);
      setIsGenerating(false);
    }
  }, [currentQuestions, isGenerating, callGenerateAIQuestion, nextQuestions]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
      setIsGenerating(false);
      setIsShuffling(false);
      isShufflingRef.current = false;
    };
  }, []);

  const currentQuestion = currentQuestions[0] || null;
  useEffect(() => {
    if (currentQuestion) {
      addQuestionHistoryEntry(currentQuestion);
    }
  }, [currentQuestion, addQuestionHistoryEntry]);

  const handleDiscard = async (questionId: Id<'questions'>) => {
    try {
      setCurrentQuestions((prev) => {
        const newQuestions = prev.filter((q) => q._id !== questionId);
        if (newQuestions.length === 0 && !isGenerating) {
          setIsGenerating(true);
          const count = isShuffling ? 1 : 2;
          const timeout = setTimeout(() => {
            void callGenerateAIQuestion(count, isShuffling);
          }, 0);
          timeoutRefs.current.push(timeout);
        }
        return newQuestions;
      });

      await discardQuestion({
        questionId,
        startTime,
      });
    } catch (error) {
      console.error('Error discarding question:', error);
      toast.error('Failed to discard question. Please try again.');
    }
  };

  const toggleLike = async (questionId: Id<'questions'>) => {
    try {
      if (!currentQuestions) return;
      const viewDuration = Math.min(Date.now() - startTime, 10000);
      const isLiked = likedQuestions.includes(questionId);

      if (isLiked) {
        removeLikedQuestion(questionId);
      } else {
        addLikedQuestion(questionId);
      }

      if (isLiked) {
        toast.success('Removed from favorites');
      } else {
        await recordAnalytics({
          questionId,
          event: 'like',
          viewDuration,
        });
        toast.success('Added to favorites!');
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update favorites. Please try again.');
    }
  };

  const toggleHide = (questionId: Id<'questions'>) => {
    try {
      if (!currentQuestions) return;
      addHiddenQuestion(questionId);
      toast.success('Question hidden');
      getNextQuestion();
    } catch (error) {
      console.error('Error hiding question:', error);
      toast.error('Failed to hide question. Please try again.');
    }
  };

  const getNextQuestion = () => {
    try {
      setStartTime(Date.now());
      isShufflingRef.current = false;
      if (currentQuestion) {
        void handleDiscard(currentQuestion._id as Id<'questions'>);
      }
    } catch (error) {
      console.error('Error getting next question:', error);
      toast.error('Failed to advance to next question. Please try again.');
    }
  };

  const handleShuffleStyleAndTone = () => {
    if (styles && styles.length > 0) {
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      setSelectedStyle(randomStyle.id);
    }

    if (tones && tones.length > 0) {
      const randomTone = tones[Math.floor(Math.random() * tones.length)];
      setSelectedTone(randomTone.id);
    }
    if (!isStyleTonesOpen) {
        handleConfirmRandomizeStyleAndTone();
    }
  };

  const handleCancelRandomizeStyleAndTone = () => {
    isShufflingRef.current = false;
    setIsShuffling(false);
  };

  const handleConfirmRandomizeStyleAndTone = () => {
    setCurrentQuestions([]);
    setIsShuffling(true);
    isShufflingRef.current = true;
  };

  const handleHideStyle = (styleId: string) => {
    addHiddenStyle(styleId);
    handleShuffleStyleAndTone();
  };

  const handleHideTone = (toneId: string) => {
    addHiddenTone(toneId);
    handleShuffleStyleAndTone();
  };

  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;

  const value = {
    styles,
    tones,
    selectedStyle,
    setSelectedStyle,
    selectedTone,
    setSelectedTone,
    currentQuestion,
    isGenerating,
    isShuffling,
    isStyleTonesOpen,
    setIsStyleTonesOpen,
    getNextQuestion,
    handleShuffleStyleAndTone,
    handleConfirmRandomizeStyleAndTone,
    handleCancelRandomizeStyleAndTone,
    toggleLike,
    toggleHide,
    handleHideStyle,
    handleHideTone,
    isFavorite,
    style,
    tone,
  };

  return <QuestionStateContext.Provider value={value}>{children}</QuestionStateContext.Provider>;
};
