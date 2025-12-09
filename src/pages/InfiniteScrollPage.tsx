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
import { useAuth, SignInButton } from "@clerk/clerk-react";
import { SignInCTA } from "@/components/SignInCTA";

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
  const [showAuthCTA, setShowAuthCTA] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Doc<"questions"> | null>(null);
  const [prevQuestion, setPrevQuestion] = useState<Doc<"questions"> | null>(null);
  const [nextQuestion, setNextQuestion] = useState<Doc<"questions"> | null>(null);
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
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          const questionId = entry.target.getAttribute('data-question-id');
          if (questionId) {
            const question = questionsRef.current.find(q => q._id === questionId);
            if (question) {
              if (index === 0) {
                setPrevQuestion(null);
              } else {
                setPrevQuestion(questionsRef.current[index - 1]);
              }
              setActiveQuestion(question);
              setNextQuestion(questionsRef.current[index + 1]);
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
  const gradientTarget = effectiveTheme === "dark" ? "#000" : "#bbb";


  useEffect(() => {
    if (style?.color && tone?.color) {
      setBgGradient([style.color, tone.color]);
    }
  }, [style, tone]);

  // Function to load more questions
  const loadMoreQuestions = useCallback(async () => {
    // Check if we are already loading or missing params
    if (isLoading || !hasMore || showAuthCTA) return;

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
            prompt: "Generate random, engaging ice-breaker questions.",
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

          if (err instanceof Error && err.message.includes("logged in")) {
            setShowAuthCTA(true);
            setHasMore(false);
          }
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
  }, [convex, isLoading, seenIds, hiddenQuestions, generateAIQuestions, hasMore, showAuthCTA]);

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

  // Smooth gradient transition logic
  const [bgGradient, setBgGradient] = useState<[string, string]>(['#667EEA', '#764BA2']);

  // Refs for data needed in scroll handler to avoid frequent re-attachments
  const stylesMapRef = useRef(stylesMap);
  const tonesMapRef = useRef(tonesMap);

  useEffect(() => {
    stylesMapRef.current = stylesMap;
  }, [stylesMap]);

  useEffect(() => {
    tonesMapRef.current = tonesMap;
  }, [tonesMap]);

  useEffect(() => {
    const handleScrollColor = () => {
      const centerY = window.innerHeight / 2;
      const range = window.innerHeight / 1.5; // Cards within this distance from center contribute to color

      let totalWeight = 0;
      let r1 = 0, g1 = 0, b1 = 0;
      let r2 = 0, g2 = 0, b2 = 0;

      // Helper to parse hex
      const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '');
        let r = 0, g = 0, b = 0;
        if (clean.length === 3) {
          r = parseInt(clean[0] + clean[0], 16);
          g = parseInt(clean[1] + clean[1], 16);
          b = parseInt(clean[2] + clean[2], 16);
        } else {
          r = parseInt(clean.substring(0, 2), 16);
          g = parseInt(clean.substring(2, 4), 16);
          b = parseInt(clean.substring(4, 6), 16);
        }
        return [r, g, b];
      };

      questionsRef.current.forEach((q) => {
        const el = cardRefs.current.get(q._id);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const dist = Math.abs(cardCenter - centerY);

        if (dist < range) {
          // Weight follows a cosine overlap or linear curve
          // Using Math.max(0, 1 - dist/range) gives a linear falloff
          // Squaring it makes the transition smoother at the extremes
          const weight = Math.pow(Math.max(0, 1 - dist / range), 2);

          if (weight > 0) {
            const s = q.style ? stylesMapRef.current.get(q.style) : undefined;
            const t = q.tone ? tonesMapRef.current.get(q.tone) : undefined;
            const colors = (s?.color && t?.color) ? [s.color, t.color] : ['#667EEA', '#764BA2'];

            const rgb1 = hexToRgb(colors[0]);
            const rgb2 = hexToRgb(colors[1]);

            r1 += rgb1[0] * weight;
            g1 += rgb1[1] * weight;
            b1 += rgb1[2] * weight;

            r2 += rgb2[0] * weight;
            g2 += rgb2[1] * weight;
            b2 += rgb2[2] * weight;

            totalWeight += weight;
          }
        }
      });

      if (totalWeight > 0) {
        const final1 = `rgb(${Math.round(r1 / totalWeight)}, ${Math.round(g1 / totalWeight)}, ${Math.round(b1 / totalWeight)})`;
        const final2 = `rgb(${Math.round(r2 / totalWeight)}, ${Math.round(g2 / totalWeight)}, ${Math.round(b2 / totalWeight)})`;
        setBgGradient([final1, final2]);
      }
    };

    // Throttle or use RAF
    let rafId: number;
    const onScroll = () => {
      rafId = requestAnimationFrame(handleScrollColor);
    };

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onScroll);
    // Initial calculation
    handleScrollColor();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []); // Empty dependency array as we use refs
  return (
    <div
      className="min-h-screen overflow-hidden flex flex-col"
    >
      <div
        className="h-screen fixed top-0 left-0 right-0 z-0"
        style={{
          background: `linear-gradient(135deg, ${bgGradient[0]}, ${gradientTarget}, ${bgGradient[1]})`,
          transition: "background 0.2s ease-out"
        }}
      >
      </div>
      <Header />

      <main className="z-10 flex-1 flex flex-col pb-20 pt-20">
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

          {showAuthCTA && (
            <SignInCTA
              bgGradient={bgGradient}
              title="Want more questions?"
              featureHighlight={{
                pre: "Sign in to get",
                highlight: "10 free AI generations",
                post: "every month!"
              }}
            />
          )}

          {!hasMore && !showAuthCTA && questions.length > 0 && (
            <div className="text-center py-8 text-white/70">
              No more questions found for this style and tone.
            </div>
          )}

          {!hasMore && !showAuthCTA && questions.length === 0 && !isLoading && (
            <div className="text-center py-8 text-white/70">
              No questions found. Try changing the style or tone.
            </div>
          )}
        </div>
      </main>

      <Button
        onClick={scrollToTop}
        className="fixed bottom-6 left-6 rounded-full w-12 h-12 p-0 shadow-lg z-50"
        variant="default"
      >
        <ArrowUp className="w-6 h-6" />
      </Button>

    </div>
  );
}
