import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { ModernQuestionCard } from "../modern-question-card";
import { StyleSelector, StyleSelectorRef } from "../styles-selector";
import { ToneSelector, ToneSelectorRef } from "../tone-selector";
import { ArrowBigRight, Shuffle } from "lucide-react";
import { cn } from "../../lib/utils";
import { useLocalStorage } from "../../hooks/useLocalStorage";

interface QuestionManagerProps {
  theme: "light" | "dark";
  onGradientChange?: (gradient: Record<string, string>) => void;
}

export function QuestionManager({ theme, onGradientChange }: QuestionManagerProps) {
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [hiddenQuestions, setHiddenQuestions] = useLocalStorage<Id<"questions">[]>("hiddenQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const [seenQuestionIds, setSeenQuestionIds] = useState<Id<"questions">[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedTone, setSelectedTone] = useState("");
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);
  
  const toneSelectorRef = useRef<ToneSelectorRef>(null);
  const styleSelectorRef = useRef<StyleSelectorRef>(null);
  
  const generateAIQuestion = useAction(api.ai.generateAIQuestion);
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  
  const nextQuestions = useQuery(api.questions.getNextQuestions,
    (selectedStyle === "" || selectedTone === "") ? "skip" : {
      count: 5,
      style: selectedStyle,
      tone: selectedTone,
      seen: [...seenQuestionIds, ...hiddenQuestions],
    });
  
  const style = useQuery(api.styles.getStyle, (selectedStyle === "") ? "skip" : { id: selectedStyle });
  const tone = useQuery(api.tones.getTone, (selectedTone === "") ? "skip" : { id: selectedTone });

  // Auto-generate questions when style/tone are selected
  useEffect(() => {
    if ((selectedStyle !== "" && selectedTone !== "") && (!nextQuestions || nextQuestions.length === 0) && !isGenerating && !isRandomizing) {
      setIsGenerating(true);
      generateAIQuestion({
        selectedTags: [],
        style: selectedStyle,
        tone: selectedTone,
      }).then(question => {
        setCurrentQuestions((prev) => [question as Doc<"questions">, ...prev]);
        setIsGenerating(false);
      });
    }
  }, [selectedStyle, selectedTone, nextQuestions, isGenerating, generateAIQuestion, isRandomizing]);

  // Update current questions when new questions are fetched
  useEffect(() => {
    if (!nextQuestions || nextQuestions.length === 0) {
      return;
    }

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
  }, [nextQuestions, selectedStyle, selectedTone]);

  // Reset state when style/tone changes
  useEffect(() => {
    setStartTime(Date.now());
    setSeenQuestionIds([]);
    setCurrentQuestions([]);
  }, [selectedStyle, selectedTone]);

  useEffect(() => {
    if (isRandomizing) {
      setIsRandomizing(false);
    }
  }, [selectedStyle, selectedTone, isRandomizing]);

  const handleDiscard = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return;
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

  const generateNewQuestion = () => {
    setStartTime(Date.now());
    if (currentQuestions.length > 0) {
      void handleDiscard(currentQuestions[0]._id as Id<"questions">);
    }
  };

  const handleShuffleStyleAndTone = () => {
    setIsRandomizing(true);
    toneSelectorRef.current?.randomizeTone();
    styleSelectorRef.current?.randomizeStyle();
  };

  const currentQuestion = currentQuestions[0] || null;
  const isFavorite = currentQuestion ? likedQuestions.includes(currentQuestion._id) : false;
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  
  const isColorDark = (color: string) => {
    const [r, g, b] = color.match(/\w\w/g)!.map(hex => parseInt(hex, 16));
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  useEffect(() => {
    if(!style) return;
    if(!tone) return;
    if(!onGradientChange) return;
    onGradientChange?.({["style"]: style.color, ["tone"]: tone.color});
  }, [style, tone, onGradientChange]);

  return (
    <>
      {/* Question Card */}
      <div className="flex-1 flex items-center justify-center px-5 pb-8">
        <ModernQuestionCard
          isGenerating={isGenerating}
          question={currentQuestion}
          isFavorite={isFavorite}
          gradient={gradient}
          onToggleFavorite={() => currentQuestion && void toggleLike(currentQuestion._id)}
          onHide={() => {
            if (!currentQuestion) return;
            setHiddenQuestions((prev) => [...prev, currentQuestion._id]);
            generateNewQuestion();
            toast.success("Question hidden");
          }}
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
            className={cn(
              isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", 
              "px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
            )}
            title="Generate question"
          >
            <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
            <span className="sm:block hidden text-white font-semibold text-base">Randomize</span>
          </button>
          <button
            onClick={generateNewQuestion}
            className={cn(
              isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", 
              "px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
            )}
            title="New question"
          >
            <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
            <span className="sm:block hidden text-white font-semibold text-base">New Question</span>
          </button>
        </div>
      )}
    </>
  );
}
