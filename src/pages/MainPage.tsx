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
  const [autoAdvanceShuffle] = useLocalStorage<boolean>("autoAdvanceShuffle", false);
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
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);

  const callGenerateAIQuestion = useCallback(async (count: number) => {
    setIsGenerating(true);
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
      } else if (currentQuestions.length === 0 && !isGenerating) {
        void callGenerateAIQuestion(10);
      }
    }
  }, [nextQuestions, isGenerating, currentQuestions.length, callGenerateAIQuestion, hiddenQuestions]);

  useEffect(() => {
    if (currentQuestions.length > 0 && currentQuestions.length <= 5 && !isGenerating) {
      const questionsToGenerate = 10 - currentQuestions.length;
      void callGenerateAIQuestion(questionsToGenerate);
    }
  }, [currentQuestions, isGenerating, callGenerateAIQuestion]);

  useEffect(() => {
    setCurrentQuestions(prev => prev.filter(q => !hiddenQuestions.includes(q._id)));
  }, [hiddenQuestions]);

  const currentQuestion = currentQuestions[0] || null;
  useEffect(() => {
    if (currentQuestion) {
      addQuestionToHistory(currentQuestion);
    }
  }, [currentQuestion, addQuestionToHistory]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

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
        />
      </main>
    </div>
  );
}
