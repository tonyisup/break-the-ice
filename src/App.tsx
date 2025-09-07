import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState, useRef } from "react";
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
import { ArrowBigRight, Shuffle } from "lucide-react";
import { cn } from "./lib/utils";

export default function App() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const [selectedStyle, setSelectedStyle] = useState("open-ended");
  const [selectedTone, setSelectedTone] = useState("fun-silly");
  const toneSelectorRef = useRef<ToneSelectorRef>(null);
  const styleSelectorRef = useRef<StyleSelectorRef>(null);
  const nextQuestions = useQuery(api.questions.getNextQuestions, {
    count: 10,
    style: selectedStyle,
    tone: selectedTone,
    seen: seenQuestionIds,
  });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);
  const style = useQuery(api.styles.getStyle, { id: selectedStyle });
  const tone = useQuery(api.tones.getTone, { id: selectedTone });

  useEffect(() => {
    if (!nextQuestions || nextQuestions.length === 0) return;
    setIsGenerating(false);

    setCurrentQuestions(prevQuestions => {
      // Only append new questions that we don't already have
      const existingIds = new Set(prevQuestions.map(q => q._id));
      const newQuestions = nextQuestions.filter(q => !existingIds.has(q._id));

      if (newQuestions.length > 0) {
        return [...prevQuestions, ...newQuestions];
      }

      return prevQuestions;
    });
  }, [nextQuestions, selectedStyle, selectedTone]);

  
  // Reset start time when category changes
  useEffect(() => {
    setStartTime(Date.now());
    setSeenQuestionIds([]);
  }, [selectedStyle, selectedTone]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleDiscard = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return; // This shouldn't happen! We should always generate more
    setSeenQuestionIds((prev) => [...prev, questionId]);
    setCurrentQuestions(prev => prev.filter(question => question._id !== questionId));
    const getMore = currentQuestions.length == 1;
    setIsGenerating(getMore);
    void discardQuestion({
      questionId,
      startTime,
      style: getMore ? selectedStyle : undefined,
      tone: getMore ? selectedTone : undefined,
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

  const handleAIQuestionGenerated = (question: Doc<"questions">) => {
    setCurrentQuestions((prev) => [question, ...prev]);
    setShowAIGenerator(false);
  };

  const generateNewQuestion = () => {
    setStartTime(Date.now());
    if (currentQuestions.length > 0) {
      void handleDiscard(currentQuestions[0]._id as Id<"questions">);
    }
  };

  const handleShuffleStyleAndTone = () => {
    // Call the randomizer function from the ToneSelector component
    toneSelectorRef.current?.randomizeTone();
    styleSelectorRef.current?.randomizeStyle();
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
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradientTarget}, ${gradientTarget})`
      }}
    >
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Link
            to="/liked"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white", isFavorite && "bg-white/20 dark:bg-white/20")}
          >
            ❤️ Liked Questions
          </Link>
        </div>
        <button
          onClick={toggleTheme}
          className={cn(isColorDark(gradient[1]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "p-2 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white", isFavorite && "bg-white/20 dark:bg-white/20")}
          >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
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
          selectedStyle={selectedStyle}
          ref={styleSelectorRef}
          onSelectStyle={setSelectedStyle}
        />
        <ToneSelector
          ref={toneSelectorRef}
          selectedTone={selectedTone}
          onSelectTone={setSelectedTone}
        />

        {!isGenerating && (
          <div className="flex justify-center gap-4">
            <button
              onClick={handleShuffleStyleAndTone}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Generate question"
            >
              <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Randomize</span>
            </button>
            <button
              onClick={generateNewQuestion}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="New question"
            >
              <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">New Question</span>
            </button>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showAIGenerator && (
          <AIQuestionGenerator
            onQuestionGenerated={handleAIQuestionGenerated}
            onClose={() => setShowAIGenerator(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
