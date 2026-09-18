import { useQuery, useConvex, useMutation, useAction } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "@/hooks/useTheme";
import { useStorageContext } from "@/hooks/useStorageContext";
import { useTeamWorkspace } from "@/hooks/useTeamWorkspace";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ArrowUp, SearchX, X } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { AnchorHeader } from "@/components/filter-controls/AnchorHeader";
import { ItemDetails, ItemDetailDrawer } from "@/components/item-detail-drawer/item-detail-drawer";
import { Icon } from "@/components/ui/icons/icon";
import { useAuth } from "@clerk/clerk-react";
import { SignInCTA } from "@/components/SignInCTA";
import { UpgradeCTA } from "@/components/UpgradeCTA";
import { NewsletterCard } from "@/components/newsletter-card/NewsletterCard";
import { RefineResultsCTA } from "@/components/RefineResultsCTA";
import { ERROR_MESSAGES, ERROR_CODES } from "../../convex/constants";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils";
import { orderQuestionBatch } from "@/lib/questionOrder";

const sortAnchoredBatch = (questions: Doc<"questions">[], anchoredCount: number) => {
  const anchored = orderQuestionBatch(questions.slice(0, anchoredCount));
  return [...anchored, ...orderQuestionBatch(questions.slice(anchoredCount), anchored.at(-1))];
};

const PUBLIC_FEED_BANNER_DISMISSED_KEY = "break-the-ice:public-feed-banner-dismissed:v1";

export default function InfiniteScrollPage() {
  useTheme();
  const convex = useConvex();
  const user = useAuth();
  const { activeWorkspace, teamWorkspaceId } = useTeamWorkspace();
  const generateAIQuestions = useAction(api.core.ai.generateAIQuestionForFeed);
  const [searchParams, setSearchParams] = useSearchParams();

  const anchoredStyleParam = searchParams.get("style");
  const anchoredToneParam = searchParams.get("tone");
  const anchoredTopicParam = searchParams.get("topic");

  const [selectedAnchorItem, setSelectedAnchorItem] = useState<ItemDetails | null>(null);
  const [isAnchorDrawerOpen, setIsAnchorDrawerOpen] = useState(false);

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
  const [isPublicFeedBannerDismissed, setIsPublicFeedBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(PUBLIC_FEED_BANNER_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [activeQuestion, setActiveQuestion] = useState<Doc<"questions"> | null>(null);
  const currentUser = useQuery(api.core.users.getCurrentUser, {
    organizationId: activeWorkspace ?? undefined,
  });
  // Fetch all styles and tones for card rendering
  const allStyles = useQuery(api.core.styles.getStyles, {
    organizationId: teamWorkspaceId,
  });
  const allTones = useQuery(api.core.tones.getTones, {
    organizationId: teamWorkspaceId,
  });
  const allTopics = useQuery(api.core.topics.getTopics, {
    organizationId: teamWorkspaceId,
  });
  const activeTakeoverTopics = useQuery(api.core.topics.getActiveTakeoverTopics);
  const interactionStats = useQuery(api.core.users.getUserInteractionStats, {
    organizationId: activeWorkspace ?? undefined,
  });
  const dismissRefineCTA = useMutation(api.core.users.dismissRefineCTA);
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

  const dismissPublicFeedBanner = useCallback(() => {
    setIsPublicFeedBannerDismissed(true);
    try {
      window.localStorage.setItem(PUBLIC_FEED_BANNER_DISMISSED_KEY, "true");
    } catch {
      // The banner still stays dismissed for this page view when storage is unavailable.
    }
  }, []);

  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    if (!allStyles) return map;
    allStyles.forEach(s => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s.slug, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [allStyles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    if (!allTones) return map;
    allTones.forEach(t => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t.slug, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [allTones]);

  const topicsMap = useMemo(() => {
    const map = new Map<string, Doc<"topics">>();
    if (!allTopics) return map;
    allTopics.forEach(t => {
      map.set(t.id, t);
      map.set(t.slug, t);
      map.set(t._id, t);
    });
    return map;
  }, [allTopics]);

  const anchoredStyle = anchoredStyleParam ? stylesMap.get(anchoredStyleParam) : undefined;
  const anchoredTone = anchoredToneParam ? tonesMap.get(anchoredToneParam) : undefined;
  const anchoredTopic = anchoredTopicParam ? topicsMap.get(anchoredTopicParam) : undefined;
  const anchoredStyleId = anchoredStyle?._id ?? null;
  const anchoredToneId = anchoredTone?._id ?? null;
  const anchoredTopicId = anchoredTopic?._id ?? null;
  const anchorParamsReady =
    (!anchoredStyleParam || allStyles !== undefined) &&
    (!anchoredToneParam || allTones !== undefined) &&
    (!anchoredTopicParam || allTopics !== undefined);

  // Keep old ID-based links working, then replace them with canonical slugs.
  useEffect(() => {
    if (!anchorParamsReady) return;

    const newParams = new URLSearchParams(searchParams);
    let changed = false;
    const normalizeParam = (key: "style" | "tone" | "topic", value: string | null, item: { slug?: string; id?: string } | undefined) => {
      if (!value) return;
      const slug = item?.slug ?? item?.id;
      if (!slug) {
        newParams.delete(key);
        changed = true;
      } else if (value !== slug) {
        newParams.set(key, slug);
        changed = true;
      }
    };

    normalizeParam("style", anchoredStyleParam, anchoredStyle);
    normalizeParam("tone", anchoredToneParam, anchoredTone);
    normalizeParam("topic", anchoredTopicParam, anchoredTopic);
    if (changed) setSearchParams(newParams, { replace: true });
  }, [anchorParamsReady, anchoredStyleParam, anchoredToneParam, anchoredTopicParam, anchoredStyle, anchoredTone, anchoredTopic, searchParams, setSearchParams]);

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

  // Track the centered question for viewing history.
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
        void recordAnalytics({
          questionId: activeQuestionRef.current._id,
          event: "seen",
          viewDuration: duration,
          sessionId: user.sessionId ?? undefined,
        }).catch(() => { /* Viewing history remains local if analytics is unavailable. */ });

        if (duration > 1000) {
          addQuestionToHistory({
            question: activeQuestionRef.current,
            viewedAt: Date.now(),
          });
        }
      }
    };
  }, [activeQuestion, recordAnalytics, addQuestionToHistory, user.sessionId]);

  // Check if all styles or tones are blocked
  const allStylesBlocked = useMemo(() => {
    if (!allStyles || allStyles.length === 0 || !hiddenStyles) return false;
    return allStyles.every(s => hiddenStyles.includes(s._id));
  }, [allStyles, hiddenStyles]);

  const allTonesBlocked = useMemo(() => {
    if (!allTones || allTones.length === 0 || !hiddenTones) return false;
    return allTones.every(t => hiddenTones.includes(t._id));
  }, [allTones, hiddenTones]);

  // Function to load more questions
  const loadMoreQuestions = useCallback(async () => {
    // Check if we are already loading or missing params
    const isStorageLoaded = hiddenStyles !== undefined && hiddenTones !== undefined &&
      (!user.isSignedIn || (hiddenStyles !== null && hiddenTones !== null));

    if (!user.isLoaded || !anchorParamsReady || isLoadingRef.current || !hasMore || allStylesBlocked || allTonesBlocked || !isStorageLoaded) return;

    // Capture current request ID
    requestIdRef.current++;
    const currentRequestId = requestIdRef.current;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const isFirstPull = questionsRef.current.length === 0;
      const BATCH_SIZE = isFirstPull ? 10 : 5;
      const hasAnchors = !!(anchoredStyleId || anchoredToneId || anchoredTopicId);

      if (hasAnchors) {
        const feedBatch = await convex.action(api.core.questions.getNextRandomQuestions, {
          count: BATCH_SIZE,
          seen: Array.from(seenIds),
          hidden: hiddenQuestions,
          hiddenStyles: hiddenStyles ?? [],
          hiddenTones: hiddenTones ?? [],
          organizationId: activeWorkspace ?? undefined,
          randomSeed: Math.random(),
          anchoredStyleId: anchoredStyleId ?? undefined,
          anchoredToneId: anchoredToneId ?? undefined,
          anchoredTopicId: anchoredTopicId ?? undefined,
        });

        if (currentRequestId !== requestIdRef.current) return;

        const dbQuestions = Array.isArray(feedBatch) ? feedBatch : feedBatch.questions;
        const anchoredMatchCount = Array.isArray(feedBatch) ? 0 : feedBatch.anchoredMatchCount;
        const targetAnchoredCount = Array.isArray(feedBatch) ? Math.min(BATCH_SIZE, BATCH_SIZE >= 10 ? 6 : Math.ceil(BATCH_SIZE * 0.6)) : feedBatch.targetAnchoredCount;
        const anchoredQuestions = dbQuestions.slice(0, anchoredMatchCount);
        const generalQuestions = dbQuestions.slice(anchoredMatchCount);
        const anchorShortfall = Math.max(0, targetAnchoredCount - anchoredQuestions.length);
        const totalShortfall = Math.max(0, BATCH_SIZE - dbQuestions.length);
        const generationCount = Math.min(5, Math.max(anchorShortfall, totalShortfall));
        let generatedQuestions: Doc<"questions">[] = [];

        if (generationCount > 0 && user.isSignedIn && !currentUser?.isAiLimitReached) {
          try {
            const generated = await generateAIQuestions({
              count: generationCount,
              organizationId: activeWorkspace ?? undefined,
              anchoredStyleId: anchoredStyleId ?? undefined,
              anchoredToneId: anchoredToneId ?? undefined,
              anchoredTopicId: anchoredTopicId ?? undefined,
            });
            if (currentRequestId !== requestIdRef.current) return;
            generatedQuestions = (generated || []).filter((question): question is Doc<"questions"> => question !== null);
          } catch (err) {
            console.error("Anchored AI generation failed:", err);
            if (currentRequestId !== requestIdRef.current) return;

            const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err);
            const errorCode = err instanceof ConvexError ? err.data?.code : null;
            const errorDataMessage = err instanceof ConvexError ? err.data?.message : null;
            const isLimitError =
              errorCode === ERROR_CODES.AI_LIMIT_REACHED ||
              errorMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
              errorDataMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
              errorMessage.includes("AI generation limit reached");

            if (totalShortfall > 0 && isLimitError) {
              setShowUpgradeCTA(true);
              setHasMore(false);
            } else if (dbQuestions.length === 0) {
              toast.error("Failed to generate more questions. Scroll to retry.");
            }
          }
        } else if (totalShortfall > 0) {
          if (!user.isSignedIn) setShowAuthCTA(true);
          if (currentUser?.isAiLimitReached) setShowUpgradeCTA(true);
          setHasMore(false);
        }

        const existingIds = new Set(dbQuestions.map((question) => question._id));
        const uniqueGenerated = generatedQuestions.filter((question) => !existingIds.has(question._id));
        const generatedAnchoredCount = Math.max(0, targetAnchoredCount - anchoredQuestions.length);
        const finalAnchored = [...anchoredQuestions, ...uniqueGenerated.slice(0, generatedAnchoredCount)];
        const generatedFallback = uniqueGenerated.slice(generatedAnchoredCount);
        const finalBatch = [...finalAnchored, ...generalQuestions, ...generatedFallback].slice(0, BATCH_SIZE);
        const orderedBatch = sortAnchoredBatch(finalBatch, finalAnchored.length);

        if (orderedBatch.length === 0) {
          if (isFirstPull) setHasMore(false);
          else setSeenIds(new Set());
          return;
        }

        if (isFirstPull) {
          setQuestions(orderedBatch);
          setSeenIds(new Set(orderedBatch.map((question) => question._id)));
        } else {
          setQuestions((previous) => {
            const previousIds = new Set(previous.map((question) => question._id));
            return [...previous, ...orderedBatch.filter((question) => !previousIds.has(question._id))];
          });
          setSeenIds((previous) => {
            const next = new Set(previous);
            orderedBatch.forEach((question) => next.add(question._id));
            return next;
          });
        }
        return;
      }

      // 1. Try to get from DB
      const feedBatch = await convex.action(api.core.questions.getNextRandomQuestions, {
        count: BATCH_SIZE,
        seen: Array.from(seenIds), // Pass currently seen IDs to avoid duplicates
        hidden: hiddenQuestions,
        hiddenStyles: hiddenStyles ?? [],
        hiddenTones: hiddenTones ?? [],
        organizationId: activeWorkspace ?? undefined,
        randomSeed: Math.random(),
        anchoredStyleId: anchoredStyleId ?? undefined,
        anchoredToneId: anchoredToneId ?? undefined,
        anchoredTopicId: anchoredTopicId ?? undefined,
      });
      const dbQuestions = Array.isArray(feedBatch) ? feedBatch : feedBatch.questions;

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
          return [...prev, ...orderQuestionBatch(uniqueNew, prev.at(-1), false)];
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
            combinedQuestions = orderQuestionBatch(combinedQuestions);

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
            combinedQuestions = orderQuestionBatch(combinedQuestions);
            setQuestions(combinedQuestions);
            setSeenIds(new Set(combinedQuestions.map(q => q._id)));
          }
          return;
        }

        try {
          const generated = await generateAIQuestions({
            organizationId: activeWorkspace ?? undefined,
            anchoredStyleId: anchoredStyleId ?? undefined,
            anchoredToneId: anchoredToneId ?? undefined,
            anchoredTopicId: anchoredTopicId ?? undefined,
          });

          // Check for staleness after generation await
          if (currentRequestId !== requestIdRef.current) return;

          const validGenerated = (generated || []).filter((q): q is Doc<"questions"> => q !== null);
          const uniqueGenerated = validGenerated.filter(q => !combinedQuestions.some(cq => cq._id === q._id));

          if (isFirstPull) {
            combinedQuestions = [...combinedQuestions, ...uniqueGenerated];

            if (combinedQuestions.length === 0) {
              setHasMore(false);
            } else {
              combinedQuestions = orderQuestionBatch(combinedQuestions);
              setQuestions(combinedQuestions);
              setSeenIds(new Set(combinedQuestions.map(q => q._id)));
            }
          } else if (uniqueGenerated.length > 0) {
            setQuestions(prev => {
              const existingIds = new Set(prev.map(q => q._id));
              const uniqueNew = uniqueGenerated.filter(q => !existingIds.has(q._id));
              if (uniqueNew.length === 0) return prev;
              return [...prev, ...orderQuestionBatch(uniqueNew, prev.at(-1), false)];
            });
            setSeenIds(prev => {
              const next = new Set(prev);
              uniqueGenerated.forEach(q => next.add(q._id));
              return next;
            });
          } else if (dbQuestions.length === 0) {
            // DB returned nothing — likely the seen set covers the whole pool.
            // Reset seen IDs so the next scroll can re-sample, instead of
            // permanently killing hasMore.
            setSeenIds(new Set());
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
            // Generic AI failure and no DB questions — reset seen IDs so
            // the next scroll attempt can re-sample the pool instead of
            // permanently stopping.
            setSeenIds(new Set());
            toast.error("Failed to generate more questions. Scroll to retry.");
          }

          // If AI failed and it was first pull, show what we have from DB
          if (isFirstPull && combinedQuestions.length > 0) {
            combinedQuestions = orderQuestionBatch(combinedQuestions);

            setQuestions(combinedQuestions);
            setSeenIds(new Set(combinedQuestions.map(q => q._id)));
          } else if (isFirstPull && combinedQuestions.length === 0) {
            setHasMore(false);
          }
        }
      } else if (isFirstPull) {
        // We have a full batch from DB, sort and show
        combinedQuestions = orderQuestionBatch(combinedQuestions);

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
  }, [convex, seenIds, hiddenQuestions, hiddenStyles, hiddenTones, generateAIQuestions, activeWorkspace, user.isSignedIn, allStylesBlocked, allTonesBlocked, currentUser, hasMore, user.isLoaded, anchoredStyleId, anchoredToneId, anchoredTopicId, anchorParamsReady]);

  // Reset list when anchors change
  useEffect(() => {
    setQuestions([]);
    const currentQuestionId = activeQuestionRef.current?._id;
    setSeenIds(currentQuestionId ? new Set([currentQuestionId]) : new Set());
    requestIdRef.current++;
    setHasMore(true);
    setShowAuthCTA(false);
    setShowUpgradeCTA(false);
  }, [anchoredStyleId, anchoredToneId, anchoredTopicId, activeWorkspace]);

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
      setHasMore(true);
      setShowAuthCTA(false);
      setShowUpgradeCTA(false);
    }
  }, [allStylesBlocked, allTonesBlocked, activeWorkspace]);

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
        toast.success("Added to favorites!", {
          action: {
            label: "Open liked",
            onClick: () => {
              window.location.href = "/liked";
            },
          },
        });
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
        toast.success("Question hidden", {
          action: {
            label: "Manage hidden",
            onClick: () => {
              window.location.href = "/settings?expand=hidden-questions";
            },
          },
        });
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

  const handleAnchorItem = (item: ItemDetails) => {
    const newParams = new URLSearchParams(searchParams);
    const paramKey = item.type.toLowerCase();
    const currentVal = newParams.get(paramKey);

    if (currentVal === item.slug || currentVal === item.id) {
      newParams.delete(paramKey);
    } else {
      newParams.set(paramKey, item.slug);
    }
    setSearchParams(newParams);
  };

  const removeAnchor = (type: "style" | "tone" | "topic") => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete(type);
    setSearchParams(newParams);
  };

  const showRefineCTA = interactionStats &&
    interactionStats.totalSeen >= 50 && interactionStats.totalLikes === 0 && !interactionStats.dismissedRefineCTA;

  return (
    <div
      className="app-shell overflow-x-clip flex flex-col"
    >
      <Header />

      <main className="flex-1 flex flex-col pb-20 pt-24">
        {currentUser !== undefined && currentUser?.planTier !== "team" && !isPublicFeedBannerDismissed && (
          <div className="mx-auto w-full max-w-2xl px-4 pb-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Public question feed
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse icebreaker questions for coaches, workshops, and team sessions.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild variant="outline" className="h-9 shrink-0 border-border bg-card text-foreground hover:bg-secondary">
                  <Link to="/pricing?source=app_banner">Team plan</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:bg-white/15 hover:text-white"
                  onClick={dismissPublicFeedBanner}
                  aria-label="Dismiss public question feed banner"
                  title="Don't show this again"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <AnchorHeader
          styleId={anchoredStyleId}
          toneId={anchoredToneId}
          topicId={anchoredTopicId}
          onRemoveStyle={() => removeAnchor("style")}
          onRemoveTone={() => removeAnchor("tone")}
          onRemoveTopic={() => removeAnchor("topic")}
          onOpenItem={(type, item) => {
            setSelectedAnchorItem({
              id: item._id,
              slug: item.id,
              name: item.name,
              type,
              description: item.description || "",
              icon: (item.icon || "CircleHelp") as Icon,
              color: item.color || "#888",
            });
            setIsAnchorDrawerOpen(true);
          }}
        />
        <div className="flex flex-col gap-6 px-4 max-w-2xl mx-auto w-full">
          {(allStylesBlocked || allTonesBlocked) && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 bg-card rounded-2xl border border-border">
              <SearchX className="w-12 h-12 text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">
                  {allStylesBlocked ? "All styles hidden" : "All tones hidden"}
                </h3>
                <p className="text-muted-foreground max-w-md">
                  {allStylesBlocked
                    ? "You have hidden all available question styles. Please unhide some styles in the settings to see more questions."
                    : "You have hidden all available tones. Please unhide some tones in the settings to see more questions."}
                </p>
              </div>
              <Button
                variant="default"
                onClick={() => {
                  window.location.href = "/settings";
                }}
              >
                Manage Preferences
              </Button>
            </div>
          )}

          {!allStylesBlocked && !allTonesBlocked && questions.length === 0 && !hasMore && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center space-y-6 bg-card rounded-2xl border border-border">
              <div className="p-2">
                <SearchX className="w-12 h-12 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">
                  {loadError ? "Couldn't load questions" : "No results found"}
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto text-lg">
                  {loadError
                    ? "Check your connection and try again."
                    : "No questions match these preferences. Try a different style or tone."}
                </p>
              </div>
              <Button
                variant="default"
                size="lg"
                className="min-h-11 px-6 font-semibold"
                onClick={() => {
                  if (!loadError) {
                    setSearchParams(previous => {
                      const next = new URLSearchParams(previous);
                      next.delete("style");
                      next.delete("tone");
                      next.delete("topic");
                      return next;
                    });
                    setSeenIds(new Set());
                  }
                  setHasMore(true);
                  setLoadError(null);
                }}
              >
                {loadError ? "Try Again" : "Browse all questions"}
              </Button>
            </div>
          )}

          {!allStylesBlocked && !allTonesBlocked && questions.map((question, index) => {
                    const cardStyle = stylesMap.get(question.styleId || (question.style as string) || "");
            const cardTone = tonesMap.get(question.toneId || (question.tone as string) || "");

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
                    style={cardStyle}
                    tone={cardTone}
                    onToggleFavorite={() => void toggleLike(question._id)}
                    onToggleHidden={() => toggleHide(question._id)}
                    onHideStyle={handleHideStyle}
                    onHideTone={handleHideTone}
                    onRemixed={handleRemix}
                    topic={question.topicId ? topicsMap.get(question.topicId) : undefined}
                    onAnchorItem={handleAnchorItem}
                    anchoredStyleId={anchoredStyleId}
                    anchoredToneId={anchoredToneId}
                    anchoredTopicId={anchoredTopicId}
                  />
                </div>

                {/* Insert Newsletter Card after the 5th question (index 4) */}
                {index === 4 && user.isLoaded && (
                  !user.isSignedIn ||
                  (currentUser && !currentUser.newsletterSubscriptionStatus)
                ) && (
                    <NewsletterCard

                      prefilledEmail={user.isSignedIn ? currentUser?.email : undefined}
                    />
                  )}

                {/* Insert Refine Results CTA after the 10th question (index 9) */}
                {index === 9 && showRefineCTA && (
                  <RefineResultsCTA
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
              <p role="status" className="text-sm text-muted-foreground">Loading questions…</p>
            </div>
          )}

          {showAuthCTA && (
            <SignInCTA
              title="Want more questions?"
              featureHighlight={{
                pre: "Sign in to",
                highlight: "create questions",
                post: "and save them across your devices."
              }}
            />
          )}

          {showUpgradeCTA && (
            <UpgradeCTA
              title="AI allowance used"
              isTeam={currentUser?.planTier === "team"}
              description={currentUser?.planTier === 'team'
                ? `You've reached your current Team workspace AI limit for this cycle.`
                : "You've used your free AI allowance for this cycle."
              }
              onUpgrade={() => {
                window.location.href = "/pricing?source=ai_limit";
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
        <ItemDetailDrawer
          item={selectedAnchorItem}
          isOpen={isAnchorDrawerOpen}
          onOpenChange={setIsAnchorDrawerOpen}
          onAnchorItem={handleAnchorItem}
          isAnchored={
            selectedAnchorItem?.type === "Style" ? anchoredStyleId === selectedAnchorItem.id :
              selectedAnchorItem?.type === "Tone" ? anchoredToneId === selectedAnchorItem.id :
                selectedAnchorItem?.type === "Topic" ? anchoredTopicId === selectedAnchorItem.id :
                  false
          }
        />
      </main>

      {showTopButton && (
        <Button
          onClick={scrollToTop}
          aria-label="Back to top"
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
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-3 text-sm text-foreground">
          <span className="text-muted-foreground">Featured topics:</span>
          <span className="font-semibold">{activeTakeoverTopics.map(topic => topic.name).join(" & ")}</span>
        </div>
      )}

    </div>
  );
}
