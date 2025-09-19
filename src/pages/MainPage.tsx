import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
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
import { isColorDark } from "@/lib/utils";

export default function MainPage() {
  const { theme, setTheme } = useTheme();

  // For migration
  const [localStorageLikedQuestions, setLocalStorageLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [localStorageHiddenQuestions, setLocalStorageHiddenQuestions] = useLocalStorage<Id<"questions">[]>("hiddenQuestions", []);
  const [localStorageAutoAdvanceShuffle, setLocalStorageAutoAdvanceShuffle] = useLocalStorage<boolean>("autoAdvanceShuffle", false);

  // DB settings
  const settings = useQuery(api.users.getSettings);
  const migrateLocalStorageSettings = useMutation(api.users.migrateLocalStorageSettings);
  const updateLikedQuestions = useMutation(api.users.updateLikedQuestions);
  const updateHiddenQuestions = useMutation(api.users.updateHiddenQuestions);

  // Local state for settings
  const [likedQuestions, setLikedQuestions] = useState<Id<"questions">[]>([]);
  const [hiddenQuestions, setHiddenQuestions] = useState<Id<"questions">[]>([]);
  const [autoAdvanceShuffle, setAutoAdvanceShuffle] = useState<boolean>(false);

  // Migration effect
  useEffect(() => {
    if (settings && !settings.migratedFromLocalStorage) {
      migrateLocalStorageSettings({
        likedQuestions: localStorageLikedQuestions,
        hiddenQuestions: localStorageHiddenQuestions,
        autoAdvanceShuffle: localStorageAutoAdvanceShuffle,
      }).then(() => {
        // Clean up local storage after migration
        setLocalStorageLikedQuestions([]);
        setLocalStorageHiddenQuestions([]);
        setLocalStorageAutoAdvanceShuffle(false);
      }).catch((error) => {
        console.error("Error migrating local storage settings:", error);
      });
    }
  }, [settings, migrateLocalStorageSettings, localStorageLikedQuestions, localStorageHiddenQuestions, localStorageAutoAdvanceShuffle, setLocalStorageLikedQuestions, setLocalStorageHiddenQuestions, setLocalStorageAutoAdvanceShuffle]);

  // Sync local state with DB settings
  useEffect(() => {
    if (settings) {
      setLikedQuestions(settings.likedQuestions ?? []);
      setHiddenQuestions(settings.hiddenQuestions ?? []);
      setAutoAdvanceShuffle(settings.autoAdvanceShuffle ?? false);
    }
  }, [settings]);

  const { addQuestionToHistory } = useQuestionHistory();
  const [startTime, setStartTime] = useState(Date.now());
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStyle, setSelectedStyle] = useState(searchParams.get("style") ?? "would-you-rather");
  const [selectedTone, setSelectedTone] = useState(searchParams.get("tone") ?? "fun-silly");
  const [randomizedTone, setRandomizedTone] = useState<string | null>(null);
  const [randomizedStyle, setRandomizedStyle] = useState<string | null>(null);
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
  const styles = useQuery(api.styles.getStyles);
  const tones = useQuery(api.tones.getTones);
  const style = useQuery(api.styles.getStyle, (selectedStyle === "") ? "skip" : { id: selectedStyle });
  const tone = useQuery(api.tones.getTone, (selectedTone === "") ? "skip" : { id: selectedTone });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);

  useEffect(() => {
    // Only scroll if we have data loaded and the URL params are different from defaults
    if (styles && searchParams.get("style") !== "would-you-rather") {
      // Small delay to ensure DOM elements are rendered
      setTimeout(() => {
        styleSelectorRef.current?.scrollToSelectedItem();
      }, 100);
    }
    if (tones && searchParams.get("tone") !== "fun-silly") {
      // Small delay to ensure DOM elements are rendered
      setTimeout(() => {
        toneSelectorRef.current?.scrollToSelectedItem();
      }, 100);
    }
  }, [searchParams, styleSelectorRef, toneSelectorRef, styles, tones]);

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("style", selectedStyle);
    newSearchParams.set("tone", selectedTone);
    setSearchParams(newSearchParams);
  }, [selectedStyle, selectedTone, setSearchParams]);

  const callGenerateAIQuestion = useCallback(async (count: number) => {
    try {
      const newQuestions = await generateAIQuestion({
        style: selectedStyle,
        tone: selectedTone,
        selectedTags: [],
        count: count,
      });
      const validNewQuestions = newQuestions.filter((q): q is Doc<"questions"> => q !== null);
      if (validNewQuestions.length > 0) {
        setCurrentQuestions(prev => [...prev, ...validNewQuestions]);
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
        void callGenerateAIQuestion(2);
      }
    }
  }, [nextQuestions, isGenerating, currentQuestions.length, callGenerateAIQuestion, hiddenQuestions]);

  useEffect(() => {
    if (nextQuestions && nextQuestions.length > 1) {
      return;
    }
    if (currentQuestions.length > 0 && currentQuestions.length <= 5) {
      if (nextQuestions && nextQuestions.length === 0) {
        // Only display the loading indicator if there are no more question in the database
        setIsGenerating(true);
      }
      // between 2 and 6 questions
      const questionsToGenerate = 7 - currentQuestions.length;
      void callGenerateAIQuestion(questionsToGenerate);
    }
  }, [currentQuestions, isGenerating, callGenerateAIQuestion, nextQuestions]);

  useEffect(() => {
    setCurrentQuestions(prev => prev.filter(q => !hiddenQuestions.includes(q._id)));
  }, [hiddenQuestions]);

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

    const newLikedQuestions = isLiked
      ? likedQuestions.filter(id => id !== questionId)
      : [...likedQuestions, questionId];

    setLikedQuestions(newLikedQuestions);

    if (isLiked) {
      toast.success("Removed from favorites");
    } else {
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration,
      });
      toast.success("Added to favorites!");
    }

    await updateLikedQuestions({ likedQuestions: newLikedQuestions });
  };

  const toggleHide = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return;
    const newHiddenQuestions = [...hiddenQuestions, questionId];
    setHiddenQuestions(newHiddenQuestions);
    toast.success("Question hidden");
    getNextQuestion();
    await updateHiddenQuestions({ hiddenQuestions: newHiddenQuestions });
  }

  const getNextQuestion = () => {
    setStartTime(Date.now());
    if (currentQuestion) {
      void handleDiscard(currentQuestion._id as Id<"questions">);
    }
  };

  const handleShuffleStyleAndTone = () => {
    toneSelectorRef.current?.randomizeTone();
    styleSelectorRef.current?.randomizeStyle();
    if (autoAdvanceShuffle) {
      setTimeout(() => {
        handleConfirmRandomizeStyleAndTone();
      }, 0);
    }
  }
  const handleCancelRandomizeStyleAndTone = () => {
    toneSelectorRef.current?.cancelRandomizingTone();
    styleSelectorRef.current?.cancelRandomizingStyle();
  }
  const handleConfirmRandomizeStyleAndTone = () => {
    setCurrentQuestions([]);
    setSeenQuestionIds([]);
    toneSelectorRef.current?.confirmRandomizedTone();
    styleSelectorRef.current?.confirmRandomizedStyle();
  }
  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";
  const settingsAreLoading = settings === undefined;


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
          {currentQuestion && (
            <QuestionDisplay
              key={currentQuestion._id}
              isGenerating={isGenerating}
              currentQuestion={currentQuestion}
              isFavorite={isFavorite}
              gradient={gradient}
              toggleLike={() => void toggleLike(currentQuestion._id)}
              onSwipe={getNextQuestion}
              toggleHide={() => void toggleHide(currentQuestion._id)}
              disabled={settingsAreLoading}
            />
          )}
          {isGenerating && !currentQuestion && (
            <QuestionDisplay
              isGenerating={isGenerating}
              currentQuestion={null}
              isFavorite={false}
              gradient={gradient}
              toggleLike={() => {}}
              toggleHide={() => {}}
              onSwipe={() => {}}
              disabled={settingsAreLoading}
            />
          )}
        </AnimatePresence>

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
          disabled={settingsAreLoading}
        />
      </main>
    </div>
  );
}
