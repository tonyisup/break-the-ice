import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "../hooks/useTheme";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useQuestionHistory } from "../hooks/useQuestionHistory";
import { StyleSelector, StyleSelectorRef } from "../components/styles-selector";
import { ToneSelector, ToneSelectorRef } from "../components/tone-selector";
import { Header } from "../components/header";
import { ActionButtons } from "../components/action-buttons";
import { QuestionDisplay } from "../components/question-display";
import { AnimatePresence } from "framer-motion";
import { CollapsibleSection } from "../components/collapsible-section/CollapsibleSection";
import { isColorDark } from "@/lib/utils";

export default function MainPage() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<Id<"questions">[]>("hiddenQuestions", []);
  const { addQuestionToHistory } = useQuestionHistory();
  const [startTime, setStartTime] = useState(Date.now());
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("would-you-rather");
  const [selectedTone, setSelectedTone] = useState("fun-silly");
  const [randomizedTone, setRandomizedTone] = useState<string | null>(null);
  const [randomizedStyle, setRandomizedStyle] = useState<string | null>(null);
  const [autoAdvanceShuffle] = useLocalStorage<boolean>("autoAdvanceShuffle", true);
  const [isStyleTonesOpen, setIsStyleTonesOpen] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const isShufflingRef = useRef(false);
  const toneSelectorRef = useRef<ToneSelectorRef>(null);
  const styleSelectorRef = useRef<StyleSelectorRef>(null);
  const generateAIQuestion = useAction(api.ai.generateAIQuestion);
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const nextQuestions = useQuery(api.questions.getNextQuestions,
    (selectedStyle === "" || selectedTone === "") ? "skip" : {
      count: 10,
      style: selectedStyle,
      tone: selectedTone,
      seen: seenQuestionIds,
    });
  const style = useQuery(api.styles.getStyle, (selectedStyle === "") ? "skip" : { id: selectedStyle });
  const tone = useQuery(api.tones.getTone, (selectedTone === "") ? "skip" : { id: selectedTone });
  const allStyles = useQuery(api.styles.getStyles);
  const allTones = useQuery(api.tones.getTones);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);

  const callGenerateAIQuestion = useCallback(async (count: number, isShuffleGeneration = false) => {
    try {
      const newQuestions = await generateAIQuestion({
        style: selectedStyle,
        tone: selectedTone,
        selectedTags: [],
        count: count,
      });
      const validNewQuestions = newQuestions.filter((q): q is Doc<"questions"> => q !== null);
      if (validNewQuestions.length > 0) {
        setCurrentQuestions(prev => {
          const updated = [...prev, ...validNewQuestions];
          // Reset shuffling state after questions are added to state
          if (isShuffleGeneration) {
            setTimeout(() => {
              setIsShuffling(false);
              // Don't reset the ref here - let it stay true until user advances
            }, 0);
          }
          return updated;
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [selectedStyle, selectedTone, generateAIQuestion]);

  useEffect(() => {
    if (nextQuestions) {
      if (nextQuestions.length > 0) {
        setCurrentQuestions(prevQuestions => {
          const newQuestions = nextQuestions.filter(q => !hiddenQuestions.includes(q._id));
          if (prevQuestions.length === 0) {
            return newQuestions;
          }
          const existingIds = new Set(prevQuestions.map(q => q._id));
          const filteredNewQuestions = newQuestions.filter(q => !existingIds.has(q._id));
          if (filteredNewQuestions.length > 0) {
            return [...prevQuestions, ...filteredNewQuestions];
          }
          return prevQuestions;
        });
      } else if ((currentQuestions.length === 0) && !isGenerating) {
        setIsGenerating(true);
        // Generate only 1 question when shuffling, 2 otherwise
        const count = isShuffling ? 1 : 2;
        console.log("First useEffect triggering generation:", { count, isShuffling, isShufflingRef: isShufflingRef.current });
        void callGenerateAIQuestion(count, isShuffling);
      }
    }
  }, [nextQuestions, isGenerating, currentQuestions.length, callGenerateAIQuestion, hiddenQuestions, isShuffling]);

  useEffect(() => {
    console.log("Second useEffect running:", { 
      nextQuestionsLength: nextQuestions?.length, 
      currentQuestionsLength: currentQuestions.length, 
      isShufflingRef: isShufflingRef.current, 
      isGenerating 
    });
    
    if (nextQuestions && nextQuestions.length > 1) {
      console.log("Second useEffect: returning early - nextQuestions.length > 1");
      return;
    }
    // Don't trigger buffer generation when shuffling - let the first useEffect handle it
    if (isShufflingRef.current) {
      console.log("Second useEffect: returning early - isShufflingRef.current is true");
      return;
    }
    // Don't trigger if we're currently generating (to avoid race conditions)
    if (isGenerating) {
      console.log("Second useEffect: returning early - isGenerating is true");
      return;
    }
    if (currentQuestions.length > 0 && currentQuestions.length <= 5) {
      if (nextQuestions && nextQuestions.length === 0) {
        setIsGenerating(true);
      }
      // Generate enough to fill the buffer (only when not shuffling)
      const questionsToGenerate = 10 - currentQuestions.length;
      console.log("Second useEffect triggering generation:", { questionsToGenerate, isShufflingRef: isShufflingRef.current, isGenerating });
      void callGenerateAIQuestion(questionsToGenerate, false);
    } else {
      console.log("Second useEffect: not triggering - currentQuestions.length not in range 1-5:", currentQuestions.length);
    }
  }, [currentQuestions, isGenerating, callGenerateAIQuestion, nextQuestions]);

  useEffect(() => {
    setCurrentQuestions(prev => prev.filter(q => !hiddenQuestions.includes(q._id)));
  }, [hiddenQuestions]);

  // Scroll to center selected style and tone when section is opened
  useEffect(() => {
    if (isStyleTonesOpen) {
      // Small delay to ensure the components are mounted and rendered
      setTimeout(() => {
        if (styleSelectorRef.current) {
          styleSelectorRef.current.scrollToCenter?.(selectedStyle);
        }
        if (toneSelectorRef.current) {
          toneSelectorRef.current.scrollToCenter?.(selectedTone);
        }
      }, 100);
    }
  }, [isStyleTonesOpen, selectedStyle, selectedTone]);

  const currentQuestion = currentQuestions[0] || null;
  useEffect(() => {
    if (currentQuestion) {
      addQuestionToHistory(currentQuestion);
    }
  }, [currentQuestion, addQuestionToHistory]);

  const handleDiscard = async (questionId: Id<"questions">) => {
    setSeenQuestionIds((prev) => [...prev, questionId]);
    setCurrentQuestions(prev => {
      const newQuestions = prev.filter(q => q._id !== questionId);
      
      // If we're about to remove the last question and no generation is in progress, start generating
      if (newQuestions.length === 0 && !isGenerating) {
        setIsGenerating(true);
        // Generate questions immediately to prevent empty state
        const count = isShuffling ? 1 : 2;
        setTimeout(() => {
          void callGenerateAIQuestion(count, isShuffling);
        }, 0);
      }
      
      return newQuestions;
    });

    void discardQuestion({
      questionId,
      startTime,
    });
  };

  const toggleLike = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return;
    const viewDuration = Math.min(Date.now() - startTime, 10000);
    const isLiked = likedQuestions.includes(questionId);

    if (isLiked) {
      setLikedQuestions(likedQuestions.filter(id => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration,
      });
      toast.success("Added to favorites!");
    }
  };

  const toggleHide = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return;
    setHiddenQuestions([...hiddenQuestions, questionId]);
    toast.success("Question hidden");
    getNextQuestion();
  }

  const getNextQuestion = () => {
    setStartTime(Date.now());
    // Reset shuffle ref when user manually advances
    isShufflingRef.current = false;
    if (currentQuestion) {
      void handleDiscard(currentQuestion._id as Id<"questions">);
    }
  };

  const handleShuffleStyleAndTone = () => {
    if (autoAdvanceShuffle) {
      // If auto-advance is enabled, immediately shuffle and advance
      if (toneSelectorRef.current && styleSelectorRef.current) {
        // Components are mounted - first randomize, then confirm
        toneSelectorRef.current.randomizeTone();
        styleSelectorRef.current.randomizeStyle();
        // Small delay to ensure randomization completes before confirmation
        setTimeout(() => {
          handleConfirmRandomizeStyleAndTone();
        }, 50);
      } else {
        // Components are not mounted - do direct randomization and confirmation
        handleConfirmRandomizeStyleAndTone();
      }
    } else {
      // If auto-advance is disabled, show the intermediate state
      // If components are mounted, use their methods
      if (toneSelectorRef.current && styleSelectorRef.current) {
        toneSelectorRef.current.randomizeTone();
        styleSelectorRef.current.randomizeStyle();
      } else {
        // If components are not mounted (collapsed), implement randomization directly
        if (allStyles && allTones) {
          const availableStyles = allStyles.filter(s => s.id !== selectedStyle);
          const availableTones = allTones.filter(t => t.id !== selectedTone);
          
          if (availableStyles.length > 0) {
            const randomStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)];
            setRandomizedStyle(randomStyle.id);
          }
          
          if (availableTones.length > 0) {
            const randomTone = availableTones[Math.floor(Math.random() * availableTones.length)];
            setRandomizedTone(randomTone.id);
          }
        }
      }
    }
  }
  const handleCancelRandomizeStyleAndTone = () => {
    // Reset shuffle ref when user cancels
    isShufflingRef.current = false;
    setIsShuffling(false);
    
    // If components are mounted, use their methods
    if (toneSelectorRef.current && styleSelectorRef.current) {
      toneSelectorRef.current.cancelRandomizingTone();
      styleSelectorRef.current.cancelRandomizingStyle();
    } else {
      // If components are not mounted, clear the randomized values directly
      setRandomizedStyle(null);
      setRandomizedTone(null);
    }
  }
  const handleConfirmRandomizeStyleAndTone = () => {
    setCurrentQuestions([]);
    setSeenQuestionIds([]);
    setIsShuffling(true);
    isShufflingRef.current = true;
    
    // If components are mounted, use their methods
    if (toneSelectorRef.current && styleSelectorRef.current) {
      toneSelectorRef.current.confirmRandomizedTone();
      styleSelectorRef.current.confirmRandomizedStyle();
    } else {
      // If components are not mounted, do randomization and apply immediately
      if (allStyles && allTones) {
        const availableStyles = allStyles.filter(s => s.id !== selectedStyle);
        const availableTones = allTones.filter(t => t.id !== selectedTone);
        
        if (availableStyles.length > 0) {
          const randomStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)];
          setSelectedStyle(randomStyle.id);
        }
        
        if (availableTones.length > 0) {
          const randomTone = availableTones[Math.floor(Math.random() * availableTones.length)];
          setSelectedTone(randomTone.id);
        }
      }
    }
  }
  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";


  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
      }}
    >
      <Header
        gradient={gradient}
      />

      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {currentQuestion ? (
            <QuestionDisplay
              key={currentQuestion._id}
              isGenerating={isGenerating}
              currentQuestion={currentQuestion}
              isFavorite={isFavorite}
              gradient={gradient}
              toggleLike={() => void toggleLike(currentQuestion._id)}
              onSwipe={getNextQuestion}
              toggleHide={() => void toggleHide(currentQuestion._id)}
            />
          ) : (
            <QuestionDisplay
              key="loading"
              isGenerating={true}
              currentQuestion={null}
              isFavorite={false}
              gradient={gradient}
              toggleLike={() => { }}
              toggleHide={() => { }}
              onSwipe={() => { }}
            />
          )}
        </AnimatePresence>

        <div className="px-4">
          <CollapsibleSection
            title="Customize Style & Tone"
            isOpen={isStyleTonesOpen}
            onOpenChange={setIsStyleTonesOpen}
          >
            <StyleSelector
              randomOrder={false}
              selectedStyle={selectedStyle}
              ref={styleSelectorRef}
              onSelectStyle={setSelectedStyle}
              onRandomizeStyle={setRandomizedStyle}
            />
            <ToneSelector
              randomOrder={false}
              ref={toneSelectorRef}
              selectedTone={selectedTone}
              onSelectTone={setSelectedTone}
              onRandomizeTone={setRandomizedTone}
            />
          </CollapsibleSection>
        </div>

        <ActionButtons
          isColorDark={isColorDark}
          gradient={gradient}
          isGenerating={isGenerating}
          currentQuestion={currentQuestion}
          randomizedStyle={randomizedStyle}
          randomizedTone={randomizedTone}
          handleShuffleStyleAndTone={handleShuffleStyleAndTone}
          handleConfirmRandomizeStyleAndTone={handleConfirmRandomizeStyleAndTone}
          handleCancelRandomizeStyleAndTone={handleCancelRandomizeStyleAndTone}
          getNextQuestion={getNextQuestion}
          isStyleTonesOpen={isStyleTonesOpen}
        />
      </main>
    </div>
  );
}
