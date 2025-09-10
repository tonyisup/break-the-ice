import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../convex/_generated/dataModel";
import { ModernQuestionCard } from "./components/modern-question-card";
import { AIQuestionGenerator } from "./components/ai-question-generator/ai-question-generator";
// import { DebugPanel } from "./components/debug-panel/debug-panel";
import { Link } from "react-router-dom";
import { useTheme } from "./hooks/useTheme";
import { AnimatePresence } from "framer-motion";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { StyleSelector, StyleSelectorRef } from "./components/styles-selector";
import { ToneSelector, ToneSelectorRef } from "./components/tone-selector";
import { ArrowBigRight, ArrowBigRightDash, RouteOff, Shuffle } from "lucide-react";
import { cn } from "./lib/utils";

export default function App() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("open-ended");
  const [selectedTone, setSelectedTone] = useState("fun-silly");
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
          // If we have no previous questions (e.g., after style/tone change), just set the new ones
          if (prevQuestions.length === 0) {
            return nextQuestions;
          }

          // Only append new questions that we don't already have
          const existingIds = new Set(prevQuestions.map(q => q._id));
          const newQuestions = nextQuestions.filter(q => !existingIds.has(q._id));

          if (newQuestions.length > 0) {
            return [...prevQuestions, ...newQuestions];
          }

          return prevQuestions;
        });
      } else if (currentQuestions.length === 0 && !isGenerating) {
        // If we have no questions, and get an empty list back, generate some.
        void callGenerateAIQuestion(10);
      }
    }
  }, [nextQuestions, isGenerating, currentQuestions.length, callGenerateAIQuestion]);

  useEffect(() => {
    if (currentQuestions.length > 0 && currentQuestions.length <= 5 && !isGenerating) {
      const questionsToGenerate = 10 - currentQuestions.length;
      void callGenerateAIQuestion(questionsToGenerate);
    }
  }, [currentQuestions, isGenerating, callGenerateAIQuestion]);

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
      // Unlike
      setLikedQuestions(likedQuestions.filter(id => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      // Like
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration,
      });
      toast.success("Added to favorites!");
    }
  };

  const getNextQuestion = () => {
    setStartTime(Date.now());
    if (currentQuestion) {
      void handleDiscard(currentQuestion._id as Id<"questions">);
    }
  };

  const handleShuffleStyleAndTone = () => {
    // Call the randomizer function from the ToneSelector component
    toneSelectorRef.current?.randomizeTone();
    styleSelectorRef.current?.randomizeStyle();
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
  const handleCancelRandomAndNextQuestion = () => {
    toneSelectorRef.current?.cancelRandomizingTone();
    styleSelectorRef.current?.cancelRandomizingStyle();
    getNextQuestion();
  }
  const currentQuestion = currentQuestions[0] || null;
  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";
  const isColorDark = (color: string) => {
    const [r, g, b] = color.match(/\w\w/g)!.map(hex => parseInt(hex, 16));
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradientTarget}, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
      }}
    >
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Link
            to="/liked"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white", isFavorite && "bg-white/20 dark:bg-white/20")}
          >
            ❤️ Liked
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            ⚙️ Settings
          </Link>
          <button
            onClick={toggleTheme}
            className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white", isFavorite && "bg-white/20 dark:bg-white/20")}
          >
            {theme === "dark" ? "🌞" : "🌙"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">


        {/* Question Card */}
        <div className="flex-1 flex items-center justify-center px-5 pb-8">

          <ModernQuestionCard
            isGenerating={isGenerating}
            question={currentQuestion}
            isFavorite={isFavorite}
            gradient={gradient}
            onToggleFavorite={() => currentQuestion && void toggleLike(currentQuestion._id)}
            onShare={() => {
              if (currentQuestion && navigator.share) {
                void navigator.share({
                  title: 'Ice Breaker Question',
                  text: currentQuestion.text,
                });
              }
            }}
          />
        </div>

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

        {randomizedStyle || randomizedTone ? (
          <div className="flex justify-center">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleShuffleStyleAndTone}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Shuffle Style and Tone"
                disabled={(!isGenerating || currentQuestion) ? false : true}
              >
                <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
              </button>
              <button
                onClick={handleConfirmRandomizeStyleAndTone}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="New Question / Confirm Shuffle"
              >
                <ArrowBigRightDash size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">New</span>
              </button>
              <button
                onClick={handleCancelRandomizeStyleAndTone}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Cancel Shuffle"
              >
                <RouteOff size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Cancel</span>
              </button>
              <button
                onClick={handleCancelRandomAndNextQuestion}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Next Question"
                disabled={(!isGenerating || currentQuestion) ? false : true}
              >
                <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Next</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleShuffleStyleAndTone}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Shuffle Style and Tone"
              >
                <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
              </button>
              <button
                onClick={getNextQuestion}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Next Question"
                disabled={isGenerating && currentQuestions.length === 0}
              >
                <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Next</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
