import { useQuery, useConvex, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "@/hooks/useTheme";
import { useStorageContext } from "@/hooks/useStorageContext";
import { useWorkspace } from "@/hooks/useWorkspace.tsx";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ArrowUp, SearchX, Sparkles } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { useAuth } from "@clerk/clerk-react";
import { SignInCTA } from "@/components/SignInCTA";
import { UpgradeCTA } from "@/components/UpgradeCTA";
import { NewsletterCard } from "@/components/newsletter-card/NewsletterCard";
import { RefineResultsCTA } from "@/components/RefineResultsCTA";
import { ERROR_MESSAGES, ERROR_CODES } from "../../convex/constants";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils";

const compareByTextLength = (a: Doc<"questions">, b: Doc<"questions">) =>
  (a.text || a.customText || "").length - (b.text || b.customText || "").length;

export default function InfiniteScrollPage() {
  const { effectiveTheme } = useTheme();
  const convex = useConvex();
  const user = useAuth();
  const { activeWorkspace } = useWorkspace();
  const generateAIQuestions = useAction(api.core.ai.generateAIQuestionForFeed);

  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    removeHiddenQuestion,
    hiddenQuestions,
    addHiddenQuestion,
    hiddenStyles,
    hiddenTones,
    addHiddenStyle,
    addHiddenTone,
    addQuestionToHistory,
  } = useStorageContext();

  const [questions, setQuestions] = useState<Doc<"questions">[]>([]);
  const [seenIds, setSeenIds] = useState<Set<Id<"questions">>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showTopButton, setShowTopButton] = useState(false);
  const [showAuthCTA, setShowAuthCTA] = useState(false);
  const [showUpgradeCTA, setShowUpgradeCTA] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Doc<"questions"> | null>(null);
  const [prevQuestion, setPrevQuestion] = useState<Doc<"questions"> | null>(null);
  const [nextQuestion, setNextQuestion] = useState<Doc<"questions"> | null>(null);
  // Fetch all styles and tones for card rendering
  const allStyles = useQuery(api.core.styles.getStyles, {
    organizationId: activeWorkspace ?? undefined,
  });
  const allTones = useQuery(api.core.tones.getTones, {
    organizationId: activeWorkspace ?? undefined,
  });
  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  const allTopics = useQuery(api.core.topics.getTopics, {
    organizationId: activeWorkspace ?? undefined,
  });
  const activeTakeoverTopics = useQuery(api.core.topics.getActiveTakeoverTopics);
  const interactionStats = useQuery(api.core.users.getUserInteractionStats, {});
  const dismissRefineCTA = useMutation(api.core.users.dismissRefineCTA);
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    if (!allStyles) return map;
    allStyles.forEach(s => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [allStyles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    if (!allTones) return map;
    allTones.forEach(t => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [allTones]);

  const topicsMap = useMemo(() => {
    const map = new Map<string, any>();
    if (!allTopics) return map;
    allTopics.forEach(t => {
      map.set(t.id, t);
      map.set(t._id, t);
    });
    return map;
  }, [allTopics]);

  // Request ID to handle race conditions
  const requestIdRef = useRef(0);

  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

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

  // Track the cards for the background gradients
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
          void recordAnalytics({
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

  const style = useQuery(api.core.styles.getStyle, { id: activeQuestion?.style || "would-you-rather" });
  const tone = useQuery(api.core.tones.getTone, { id: activeQuestion?.tone || "fun-silly" });

  // Check if all styles or tones are blocked
  const allStylesBlocked = useMemo(() => {
    if (!allStyles || allStyles.length === 0 || !hiddenStyles) return false;
    return allStyles.every(s => hiddenStyles.includes(s._id));
  }, [allStyles, hiddenStyles]);

  const allTonesBlocked = useMemo(() => {
    if (!allTones || allTones.length === 0 || !hiddenTones) return false;
    return allTones.every(t => hiddenTones.includes(t._id));
  }, [allTones, hiddenTones]);

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
    const isStorageLoaded = hiddenStyles !== undefined && hiddenTones !== undefined &&
      (!user.isSignedIn || (hiddenStyles !== null && hiddenTones !== null));

    if (!user.isLoaded || isLoadingRef.current || !hasMore || allStylesBlocked || allTonesBlocked || !isStorageLoaded) return;

    // Capture current request ID
    requestIdRef.current++;
    const currentRequestId = requestIdRef.current;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const BATCH_SIZE = 5;

      const isFirstPull = questionsRef.current.length === 0;

      // 1. Try to get from DB
      const dbQuestions = await convex.action(api.core.questions.getNextRandomQuestions, {
        count: BATCH_SIZE,
        seen: Array.from(seenIds), // Pass currently seen IDs to avoid duplicates
        hidden: hiddenQuestions,
        hiddenStyles: hiddenStyles ?? [],
        hiddenTones: hiddenTones ?? [],
        organizationId: activeWorkspace ?? undefined,
        randomSeed: Math.random(),
      });

      // Check for staleness after await
      if (currentRequestId !== requestIdRef.current) return;

      let combinedQuestions = [...dbQuestions];

      // Update state immediately ONLY if it's NOT the first pull
      // For the first pull, we want to collect the full batch (including AI) before sorting
      if (!isFirstPull && combinedQuestions.length > 0) {
        setQuestions(prev => {
          const existingIds = new Set(prev.map(q => q._id));
          const uniqueNew = combinedQuestions.filter(q => !existingIds.has(q._id));
          if (uniqueNew.length === 0) return prev;
          return [...prev, ...uniqueNew];
        });
        setSeenIds(prev => {
          const next = new Set(prev);
          combinedQuestions.forEach(q => { next.add(q._id); });
          return next;
        });
      }

      // 2. If not enough, generate more
      if (combinedQuestions.length < BATCH_SIZE) {
        if (!user.isSignedIn) {
          setShowAuthCTA(true);
          setHasMore(false);

          // If we have some DB questions and it was the first pull, we need to show them now
          if (isFirstPull && combinedQuestions.length > 0) {
            combinedQuestions.sort(compareByTextLength);

            setQuestions(combinedQuestions);
            setSeenIds(new Set(combinedQuestions.map(q => q._id)));
          }
          return;
        }

        // Proactively check for AI limit if we need more
        if (currentUser?.isAiLimitReached) {
          setShowUpgradeCTA(true);
          setHasMore(false);

          // If we have some DB questions and it was the first pull, we need to show them now
          if (isFirstPull && combinedQuestions.length > 0) {
            combinedQuestions.sort(compareByTextLength);
            setQuestions(combinedQuestions);
            setSeenIds(new Set(combinedQuestions.map(q => q._id)));
          }
          return;
        }

        try {
          const generated = await generateAIQuestions({});

          // Check for staleness after generation await
          if (currentRequestId !== requestIdRef.current) return;

          const validGenerated = (generated || []).filter((q): q is Doc<"questions"> => q !== null);
          const uniqueGenerated = validGenerated.filter(q => !combinedQuestions.some(cq => cq._id === q._id));

          if (isFirstPull) {
            combinedQuestions = [...combinedQuestions, ...uniqueGenerated];

            if (combinedQuestions.length === 0) {
              setHasMore(false);
            } else {
              combinedQuestions.sort(compareByTextLength);
              setQuestions(combinedQuestions);
              setSeenIds(new Set(combinedQuestions.map(q => q._id)));
            }
          } else if (uniqueGenerated.length > 0) {
            setQuestions(prev => {
              const existingIds = new Set(prev.map(q => q._id));
              const uniqueNew = uniqueGenerated.filter(q => !existingIds.has(q._id));
              if (uniqueNew.length === 0) return prev;
              return [...prev, ...uniqueNew];
            });
            setSeenIds(prev => {
              const next = new Set(prev);
              uniqueGenerated.forEach(q => next.add(q._id));
              return next;
            });
          } else if (dbQuestions.length === 0) {
            // If both DB and AI returned nothing, we're likely at the end
            setHasMore(false);
          }
        } catch (err) {
          console.error("AI Generation failed:", err);
          if (currentRequestId !== requestIdRef.current) return;

          const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : JSON.stringify(err));
          const errorCode = err instanceof ConvexError ? err.data?.code : null;
          const errorDataMessage = err instanceof ConvexError ? err.data?.message : null;

          // Use structured error code if available, otherwise fall back to exact constant match or conservative substring check
          const isLimitError = errorCode === ERROR_CODES.AI_LIMIT_REACHED ||
            errorMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
            errorDataMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
            errorMessage.includes("AI generation limit reached");

          if (errorMessage.includes("logged in")) {
            setShowAuthCTA(true);
            setHasMore(false);
          } else if (isLimitError) {
            setShowUpgradeCTA(true);
            setHasMore(false);
          } else if (dbQuestions.length === 0) {
            // Generic failure but no DB questions left, stop trying to load more
            setHasMore(false);
            toast.error("Failed to generate more questions.");
          }

          // If AI failed and it was first pull, show what we have from DB
          if (isFirstPull && combinedQuestions.length > 0) {
            combinedQuestions.sort(compareByTextLength);

            setQuestions(combinedQuestions);
            setSeenIds(new Set(combinedQuestions.map(q => q._id)));
          } else if (isFirstPull && combinedQuestions.length === 0) {
            setHasMore(false);
          }
        }
      } else if (isFirstPull) {
        // We have a full batch from DB, sort and show
        combinedQuestions.sort(compareByTextLength);

        setQuestions(combinedQuestions);
        setSeenIds(new Set(combinedQuestions.map(q => q._id)));
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
      if (currentRequestId !== requestIdRef.current) return;

      const errorMessage = error instanceof Error ? error.message : "Failed to load more questions.";
      setLoadError(errorMessage);
      toast.error(errorMessage);

      // Stop the infinite loop if we can't get any questions at all
      if (questionsRef.current.length === 0) {
        setHasMore(false);
      }
    } finally {
      // Only reset loading if this request is still the active one
      if (currentRequestId === requestIdRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [convex, seenIds, hiddenQuestions, hiddenStyles, hiddenTones, generateAIQuestions, activeWorkspace, user.isSignedIn, allStylesBlocked, allTonesBlocked, currentUser, hasMore, user.isLoaded]);

  // Initial load
  useEffect(() => {
    if (questions.length === 0 && hasMore) {
      void loadMoreQuestions();
    }
  }, [questions.length, hasMore, loadMoreQuestions]);

  useEffect(() => {
    if (allStylesBlocked || allTonesBlocked) {
      setQuestions([]);
      setSeenIds(new Set());
    }
  }, [allStylesBlocked, allTonesBlocked]);

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      // Increased threshold to 1000px for pre-emptive loading
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        void loadMoreQuestions();
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
        // If it was hidden, remove it from hidden
        if (hiddenQuestions.includes(questionId)) {
          removeHiddenQuestion(questionId);
        }
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
      const isHidden = hiddenQuestions.includes(questionId);
      if (isHidden) {
        removeHiddenQuestion(questionId);
        toast.success("Question unhidden");
      } else {
        // If it was liked, remove it from favorites
        if (likedQuestions.includes(questionId)) {
          removeLikedQuestion(questionId);
        }
        addHiddenQuestion(questionId);
        void recordAnalytics({
          questionId,
          event: "hidden",
          viewDuration: 0,
        });
        toast.success("Question hidden");
      }
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  }

  const handleHideStyle = (styleId: Id<"styles">) => {
    addHiddenStyle(styleId);
    // Reset list as style might change or be hidden
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
    setShowAuthCTA(false);
    setShowUpgradeCTA(false);
    // We don't manually trigger load here, the useEffect for question.length=0 or style change will handle it
  }

  const handleHideTone = (toneId: Id<"tones">) => {
    addHiddenTone(toneId);
    setQuestions([]);
    setSeenIds(new Set());
    setHasMore(true);
    setShowAuthCTA(false);
    setShowUpgradeCTA(false);
  }

  const handleRemix = (originalQuestion: Doc<"questions">, newQuestion: Doc<"questions">) => {
    setQuestions((prev) =>
      prev.map((q) => (q._id === originalQuestion._id ? newQuestion : q))
    );

    // Update activeQuestion if the one being remixed is the active one
    if (activeQuestion?._id === originalQuestion._id) {
      setActiveQuestion(newQuestion);
    }

    // Add the new question to seen IDs so it doesn't get fetched again if it were to appear in the pool
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(newQuestion._id);
      return next;
    });
  };

  // Smooth gradient transition logic
  const [bgGradient, setBgGradient] = useState<[string, string]>(['#667EEA', '#764BA2']);

  const showRefineCTA = interactionStats &&
    interactionStats.totalSeen >= 50 &&
    interactionStats.totalLikes === 0 &&
    !interactionStats.dismissedRefineCTA;

  // Determine variant for A/B testing (randomized on mount)
  // We use a ref to keep it consistent across re-renders
  const newsletterVariantRef = useRef(Math.random() > 0.5 ? 'blend' as const : 'standout' as const);

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

      <main className="z-10 flex-1 flex flex-col pb-32 pt-20">
        <div className="flex flex-col gap-6 px-4 max-w-3xl mx-auto w-full">
          {(allStylesBlocked || allTonesBlocked) && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <SearchX className="w-12 h-12 text-white/80" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-white">
                  {allStylesBlocked ? "All Styles Hidden" : "All Tones Hidden"}
                </h3>
                <p className="text-white/70 max-w-md">
                  {allStylesBlocked
                    ? "You have hidden all available question styles. Please unhide some styles in the settings to see more questions."
                    : "You have hidden all available tones. Please unhide some tones in the settings to see more questions."}
                </p>
              </div>
              <Button
                variant="default"
                onClick={() => {
                  // Direct user to settings or open the selector
                  // Since specific selectors are in the header, maybe just generic guidance or reload?
                  // For now, reload might reset if persistence isn't perfect, but better to just let them know.
                  // Actually, opening the header selectors would be ideal but hard from here.
                  // We can link to settings page if it exists and has these controls.
                  window.location.href = "/settings";
                }}
              >
                Manage Preferences
              </Button>
            </div>
          )}

          {!allStylesBlocked && !allTonesBlocked && questions.length === 0 && !hasMore && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-6 bg-white/10 backdrop-blur-md rounded-[30px] border border-white/20">
              <div className="bg-white/20 p-6 rounded-full">
                <SearchX className="w-12 h-12 text-white" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white uppercase italic">
                  {loadError ? "Oops! Something went wrong" : "No results found"}
                </h3>
                <p className="text-white/70 max-w-md mx-auto text-lg">
                  {loadError
                    ? "We hit a snag trying to load some icebreakers for you. Mind giving it another shot?"
                    : "We've searched high and low but couldn't find any questions matching your filters. Try adjusting your settings!"}
                </p>
              </div>
              <Button
                variant="default"
                size="lg"
                className="rounded-full px-10 font-bold uppercase italic tracking-wider transition-all hover:scale-105"
                onClick={() => {
                  setHasMore(true);
                  setLoadError(null);
                  // The Effect will trigger loadMoreQuestions automatically
                }}
              >
                {loadError ? "Try Again" : "Reset Filters"}
              </Button>
            </div>
          )}

          {!allStylesBlocked && !allTonesBlocked && questions.map((question, index) => {
            // Derive specific style/tone/gradient for this card
            const cardStyle = stylesMap.get(question.styleId || (question.style as string) || "");
            const cardTone = tonesMap.get(question.toneId || (question.tone as string) || "");
            const cardGradient = (cardStyle?.color && cardTone?.color)
              ? [cardStyle.color, cardTone.color]
              : ['#667EEA', '#764BA2'];

            return (
              <div key={`container-${question._id}`} className="flex flex-col gap-6 w-full">
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
                    isHidden={hiddenQuestions.includes(question._id)}
                    gradient={cardGradient}
                    style={cardStyle}
                    tone={cardTone}
                    onToggleFavorite={() => void toggleLike(question._id)}
                    onToggleHidden={() => toggleHide(question._id)}
                    onHideStyle={handleHideStyle}
                    onHideTone={handleHideTone}
                    onRemixed={handleRemix}
                    topic={question.topicId ? topicsMap.get(question.topicId) : undefined}
                  />
                </div>

                {/* Insert Newsletter Card after the 5th question (index 4) */}
                {index === 4 && user.isLoaded && (
                  !user.isSignedIn ||
                  (currentUser && !currentUser.newsletterSubscriptionStatus)
                ) && (
                    <NewsletterCard
                      variant={newsletterVariantRef.current}
                      prefilledEmail={user.isSignedIn ? currentUser?.email : undefined}
                    />
                  )}

                {/* Insert Refine Results CTA after the 10th question (index 9) */}
                {index === 9 && showRefineCTA && (
                  <RefineResultsCTA
                    bgGradient={bgGradient}
                    onDismiss={() => {
                      void dismissRefineCTA();
                    }}
                  />
                )}
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
                highlight: `${import.meta.env.VITE_MAX_FREE_AIGEN} free AI generations`,
                post: "every month!"
              }}
            />
          )}

          {showUpgradeCTA && (
            <UpgradeCTA
              bgGradient={bgGradient}
              title="Generation Limit Reached"
              description={currentUser?.subscriptionTier === 'casual'
                ? `You've reached your monthly ${import.meta.env.VITE_MAX_CASUAL_AIGEN} limit for the Casual plan. Contact support if you need more!`
                : `You've used all ${import.meta.env.VITE_MAX_FREE_AIGEN} of your free AI generations for this month.`
              }
              onUpgrade={() => {
                // Link to upgrade flow or settings
                window.location.href = "/settings";
              }}
            />
          )}

          {hasMore && !showAuthCTA && !showUpgradeCTA && (questions.length > 0 || !isLoading) && (
            <div className="flex justify-center py-8">
              <Button
                onClick={() => {
                  void loadMoreQuestions();
                }}
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      </main>

      {showTopButton && (
        <Button
          onClick={scrollToTop}
          data-testid="scroll-to-top-button"
          className={cn(
            "fixed left-6 rounded-full w-12 h-12 p-0 shadow-lg z-50 transition-all duration-300",
            activeTakeoverTopics && activeTakeoverTopics.length > 0 ? "bottom-20" : "bottom-6"
          )}
        >
          <ArrowUp className="w-6 h-6" />
        </Button>
      )}

      {activeTakeoverTopics && activeTakeoverTopics.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 text-white py-4 px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] flex items-center justify-center gap-6 animate-in slide-in-from-bottom duration-700 backdrop-blur-md border-t border-white/10"
          style={{
            background: activeTakeoverTopics.length === 1
              ? `${activeTakeoverTopics[0].color || '#9333ea'}F2`
              : `linear-gradient(90deg, ${activeTakeoverTopics[0].color || '#9333ea'}F2, ${activeTakeoverTopics[activeTakeoverTopics.length - 1].color || '#7c3aed'}F2)`
          }}
        >
          <Sparkles className="size-6 text-yellow-300 fill-yellow-300 animate-pulse" />
          <div className="flex items-center gap-4 font-black tracking-tighter uppercase text-xl italic">
            <div className="flex -space-x-3">
              {activeTakeoverTopics.map((t) => (
                <div key={t._id} className="bg-white/20 p-2 rounded-full border-2 border-white/40 shadow-xl backdrop-blur-sm" title={t.name}>
                  <IconComponent icon={(t.icon || "CircleQuestionMark") as Icon} size={28} />
                </div>
              ))}
            </div>
            <span className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
              {activeTakeoverTopics.map(t => t.name).join(" & ")} Takeover!
            </span>
          </div>
          <Sparkles className="size-6 text-yellow-300 fill-yellow-300 animate-pulse" />
        </div>
      )}

    </div>
  );
}
