import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../convex/_generated/dataModel";
import { ModernQuestionCard } from "./components/modern-question-card";
import { CategorySelector } from "./components/category-selector";
import { AIQuestionGenerator } from "./components/ai-question-generator/ai-question-generator";
// import { DebugPanel } from "./components/debug-panel/debug-panel";
import { Link } from "react-router-dom";
import { useTheme } from "./hooks/useTheme";
import { AnimatePresence } from "framer-motion";
import { useLocalStorage } from "./hooks/useLocalStorage";

export default function App() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("random");
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const nextQuestions = useQuery(api.questions.getNextQuestions, {
    count: 10,
    category: selectedCategory === "random" ? undefined : selectedCategory,
    seen: seenQuestionIds,
  });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const generateAIQuestion = useAction(api.ai.generateAIQuestion);
  const saveAIQuestion = useMutation(api.questions.saveAIQuestion);
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);
  const categories = useQuery(api.categories.getCategories);

  useEffect(() => {
    if (!nextQuestions || nextQuestions.length === 0) return;
    setIsGenerating(false);

    setCurrentQuestions(prevQuestions => {
      // When category changes, replace all questions
      if (selectedCategory !== prevQuestions[0]?.category) {
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
  }, [nextQuestions, selectedCategory]);

  useEffect(() => {
    if (
      nextQuestions &&
      nextQuestions.length === 0 &&
      !isGenerating &&
      selectedCategory !== "random"
    ) {
      setIsGenerating(true);
      toast.info("No more questions in this category. Generating a new one...");
      generateAIQuestion({
        category: selectedCategory,
        currentQuestion: currentQuestions.at(-1)?.text,
        selectedTags: [],
      }).then((newQuestion) => {
        saveAIQuestion(newQuestion).then((newQuestionDoc) => {
          if (newQuestionDoc) {
            setCurrentQuestions((prev) => [newQuestionDoc, ...prev]);
          }
          setIsGenerating(false);
        }).catch((error) => {
          console.error("Error saving AI question:", error);
          toast.error("Failed to save AI question. Please try again.");
          setIsGenerating(false);
        });
      }).catch((error) => {
        console.error("Error generating AI question:", error);
        toast.error("Failed to generate AI question. Please try again.");
        setIsGenerating(false);
      });
    }
  }, [
    nextQuestions,
    isGenerating,
    generateAIQuestion,
    saveAIQuestion,
    selectedCategory,
    currentQuestions,
  ]);

  // Reset start time when category changes
  useEffect(() => {
    setStartTime(Date.now());
    setSeenQuestionIds([]);
  }, [selectedCategory]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleDiscard = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return; // This shouldn't happen! We should always generate more
    setSeenQuestionIds((prev) => [...prev, questionId]);
    setCurrentQuestions(prev => prev.filter(question => question._id !== questionId));
    const getMore = currentQuestions.length == 0;
    setIsGenerating(getMore);
    void discardQuestion({
      questionId,
      startTime,
      category: getMore ? selectedCategory : undefined
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

  const currentQuestion = currentQuestions[0] || null;
  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;
  const category = categories?.find(c => c.id === selectedCategory);
  const gradient = category?.gradient || ['#667EEA', '#764BA2'];
  const gradientTarget = theme === "dark" ? "#000" : "#fff";

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]}, ${gradientTarget})`
      }}
    >
      {/* Header */}
      <header className="p-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Link
            to="/liked"
            className="p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            ❤️ Liked Questions
          </Link>
          <button
            onClick={() => setShowAIGenerator(true)}
            className="p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            🤖 AI Generator
          </button>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">

        {/* Category Selector */}
        <CategorySelector
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        {isGenerating && (
          <div className="flex-1 flex items-center justify-center px-5 h-full">
            <div className="text-center">
              <div className="text-white text-lg">Generating question...</div>
            </div>
          </div>
        )}


        {/* Question Card */}
        <div className="flex-1 flex items-center justify-center px-5 pb-8">

          <ModernQuestionCard
            question={currentQuestion}
            isFavorite={isFavorite}
            onToggleFavorite={() => currentQuestion && void toggleLike(currentQuestion._id)}
            onNewQuestion={generateNewQuestion}
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
