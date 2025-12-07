import { useQuery, useConvex, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "@/hooks/useTheme";
import { useStorageContext } from "@/hooks/useStorageContext";
import { useWorkspace } from "@/hooks/useWorkspace.tsx";
import { StyleSelector, StyleSelectorRef } from "@/components/styles-selector";
import { ToneSelector, ToneSelectorRef } from "@/components/tone-selector";
import { Header } from "@/components/header";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";
import { Icon } from "@/components/ui/icons/icon";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { useAuth } from "@clerk/clerk-react";

export default function InfiniteScrollPage() {
  const { effectiveTheme } = useTheme();
  const convex = useConvex();
  const user = useAuth();
  const { activeWorkspace } = useWorkspace();
  const generateAIQuestions = useAction(api.ai.generateAIQuestions);

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
    defaultStyle,
    defaultTone,
    addQuestionToHistory,
  } = useStorageContext();

  const [questions, setQuestions] = useState<Doc<"questions">[]>([]);
  const [seenIds, setSeenIds] = useState<Set<Id<"questions">>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showTopButton, setShowTopButton] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Doc<"questions"> | null>(null);

  // Fetch all styles and tones for card rendering
  const allStyles = useQuery(api.styles.getStyles, {
    organizationId: activeWorkspace ?? undefined,
  });
  const allTones = useQuery(api.tones.getTones, {
    organizationId: activeWorkspace ?? undefined,
  });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);

  const stylesMap = useMemo(() => {
    if (!allStyles) return new Map<string, Doc<"styles">>();
    // Cast to Doc<"styles"> as getStyles returns objects compatible with the Doc type
    return new Map(allStyles.map(s => [s.id, s as unknown as Doc<"styles">]));
  }, [allStyles]);

  const tonesMap = useMemo(() => {
    if (!allTones) return new Map<string, Doc<"tones">>();
    return new Map(allTones.map(t => [t.id, t as unknown as Doc<"tones">]));
  }, [allTones]);

  // Request ID to handle race conditions
  const requestIdRef = useRef(0);

  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setQuestionRef = useCallback((element: HTMLDivElement | null, questionId: string) => {
    if (element) {
      cardRefs.current.set(questionId, element);
      observerRef.current?.observe(element);
    } else {
      const el = cardRefs.current.get(questionId);
      if (el) {
        observerRef.current?.unobserve(el);
        cardRefs.current.delete(questionId);
      }
    }
  }, []);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '-50% 0px -50% 0px',
      threshold: 0
    };

    const handleIntersect: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const questionId = entry.target.getAttribute('data-question-id');
          if (questionId) {
            const question = questionsRef.current.find(q => q._id === questionId);
            if (question) {
              setActiveQuestion(question);
            }
          }
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersect, options);

    // Observe existing elements
    cardRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Track view duration
  const activeQuestionRef = useRef<Doc<"questions"> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {


    // Update refs for the new active question
    activeQuestionRef.current = activeQuestion;
    startTimeRef.current = Date.now();

    // Cleanup function to record the last question when component unmounts
    return () => {
      if (activeQuestionRef.current) {
        const duration = Date.now() - startTimeRef.current;
        if (duration > 1000) {
          recordAnalytics({
            questionId: activeQuestionRef.current._id,
            event: "seen",
            viewDuration: duration,
            sessionId: user.sessionId ?? undefined,
          }); // No catch here as it might run during unmount

          addQuestionToHistory({
            question: activeQuestionRef.current,
            viewedAt: Date.now(),
          });
        }
      }
    };
  }, [activeQuestion, recordAnalytics, addQuestionToHistory]);

  const style = useQuery(api.styles.getStyle, { id: activeQuestion?.style || defaultStyle || "would-you-rather" });
  const tone = useQuery(api.tones.getTone, { id: activeQuestion?.tone || defaultTone || "fun-silly" });

  // Used for styling and gradient
  const gradient = (style?.color && tone?.color) ? [style?.color, tone?.color] : ['#667EEA', '#764BA2'];
  const gradientTarget = effectiveTheme === "dark" ? "#000" : "#bbb";



  // Function to load more questions
  const loadMoreQuestions = useCallback(async () => {
    // Check if we are already loading or missing params
    if (isLoading) return;

    // Capture current request ID
    const currentRequestId = requestIdRef.current;
    setIsLoading(true);

    try {
      const BATCH_SIZE = 5;

      // 1. Try to get from DB
      const dbQuestions = await convex.query(api.questions.getNextRandomQuestions, {
        count: BATCH_SIZE,
        seen: Array.from(seenIds), // Pass currently seen IDs to avoid duplicates
        hidden: hiddenQuestions,
        organizationId: activeWorkspace ?? undefined,
      });

      // Check for staleness after await
      if (currentRequestId !== requestIdRef.current) return;

      let combinedQuestions = [...dbQuestions];

      // 2. If not enough, generate more
      if (combinedQuestions.length < BATCH_SIZE) {
        const needed = BATCH_SIZE - combinedQuestions.length;
        // Limit generation to avoid long waits, max 3 at a time
        const countToGenerate = Math.min(needed, 3);

        try {
          const generated = await generateAIQuestions({
            prompt: "",
            count: countToGenerate
          });

          // Check for staleness after generation await
          if (currentRequestId !== requestIdRef.current) return;

          const validGenerated = generated.filter((q): q is Doc<"questions"> => q !== null);
          combinedQuestions = [...combinedQuestions, ...validGenerated];

          if (combinedQuestions.length === 0 && generated.length === 0) {
            // If we still have 0 questions after generating, then truly no more
            setHasMore(false);
          }
        } catch (err) {
          console.error("Generation failed", err);
          // Check for staleness in error case too
          if (currentRequestId !== requestIdRef.current) return;

          // If generation fails, we just use what we have.
        }
      }

      if (combinedQuestions.length > 0) {
        setQuestions(prev => {
          const existingIds = new Set(prev.map(q => q._id));
          const uniqueNew = combinedQuestions.filter(q => !existingIds.has(q._id));
          if (uniqueNew.length === 0) return prev;
          return [...prev, ...uniqueNew];
        });
        setSeenIds(prev => {
          const next = new Set(prev);
          combinedQuestions.forEach(q => next.add(q._id));
          return next;
        });
        // Ensure hasMore is true if we successfully loaded content
        setHasMore(true);
      }

    } catch (error) {
      console.error("Error fetching questions:", error);
      // Check for staleness
      if (currentRequestId !== requestIdRef.current) return;

      toast.error("Failed to load more questions.");
    } finally {
      // Only reset loading if this request is still the active one
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [convex, isLoading, seenIds, hiddenQuestions, generateAIQuestions]);

  // Initial load
  useEffect(() => {
    if (questions.length === 0 && hasMore) {
      loadMoreQuestions();
    }
  }, [questions.length, hasMore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      // Increased threshold to 1000px for pre-emptive loading
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        loadMoreQuestions();
      }

      if (window.scrollY > 500) {
        setShowTopButton(true);
      } else {
        setShowTopButton(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreQuestions]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleLike = async (questionId: Id<"questions">) => {
    try {
      const isLiked = likedQuestions.includes(questionId);
      if (isLiked) {
        removeLikedQuestion(questionId);
        toast.success("Removed from favorites");
      } else {
        addLikedQuestion(questionId);
        await recordAnalytics({
          questionId,
          event: "liked",
          viewDuration: 0, // Not tracking duration in list view accurately
        });
        toast.success("Added to favorites!");
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      toast.error("Failed to update favorites.");
    }
  };

  const toggleHide = (questionId: Id<"questions">) => {
    try {
      addHiddenQuestion(questionId);
      toast.success("Question hidden");
      // Remove from list
      setQuestions(prev => prev.filter(q => q._id !== questionId));
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  }

  const handleHideStyle = (styleId: string) => {
    addHiddenStyle(styleId);
    // Reset list as style might change or be hidden
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
    // We don't manually trigger load here, the useEffect for question.length=0 or style change will handle it
  }

  const handleHideTone = (toneId: string) => {
    addHiddenTone(toneId);
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
  }

  // Mock highlighting states required by selectors but not used here
  const [isHighlighting, setIsHighlighting] = useState(false);

  return (
    <div
      className="min-h-screen transition-colors overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradientTarget}, ${gradient[1]})`
      }}
    >
      <Header />

      <main className="flex-1 flex flex-col pb-20">
        <div className="flex flex-col gap-6 px-4 max-w-3xl mx-auto w-full">
          {questions.map((question) => {
            // Derive specific style/tone/gradient for this card
            const cardStyle = question.style ? stylesMap.get(question.style) : undefined;
            const cardTone = question.tone ? tonesMap.get(question.tone) : undefined;
            const cardGradient = (cardStyle?.color && cardTone?.color)
              ? [cardStyle.color, cardTone.color]
              : ['#667EEA', '#764BA2'];

            return (
              <div
                key={question._id}
                ref={(el) => setQuestionRef(el, question._id)}
                data-question-id={question._id}
                className="w-full"
              >
                <ModernQuestionCard
                  isGenerating={false}
                  question={question}
                  isFavorite={likedQuestions.includes(question._id)}
                  gradient={cardGradient}
                  style={cardStyle}
                  tone={cardTone}
                  onToggleFavorite={() => toggleLike(question._id)}
                  onToggleHidden={() => toggleHide(question._id)}
                  onHideStyle={handleHideStyle}
                  onHideTone={handleHideTone}
                />
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          )}

          {!hasMore && questions.length > 0 && (
            <div className="text-center py-8 text-white/70">
              No more questions found for this style and tone.
            </div>
          )}

          {!hasMore && questions.length === 0 && !isLoading && (
            <div className="text-center py-8 text-white/70">
              No questions found. Try changing the style or tone.
            </div>
          )}
        </div>
      </main>

      {showTopButton && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-6 left-6 rounded-full w-12 h-12 p-0 shadow-lg z-50"
          variant="default"
        >
          <ArrowUp className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
