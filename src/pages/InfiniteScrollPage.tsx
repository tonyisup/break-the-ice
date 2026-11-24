import { useQuery, useConvex, useMutation, useAction } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useReducedMotion } from "framer-motion";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useTheme } from "@/hooks/useTheme";
import { useStorageContext } from "@/hooks/useStorageContext";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ArrowUp, SearchX, Sparkles, X } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card";
import { HiddenCardNotice } from "@/components/hidden-card-notice/HiddenCardNotice";
import { collapseFeedCard } from "@/components/hidden-card-notice/collapseFeedCard";
import { ctaHolderId, keepCtasInPlace, type CtaAnchors } from "./feedCtaAnchors";
import { ActiveFilterChips, FeedFilterBar, type FeedFilterKey, type FeedFilterOption } from "@/components/filter-controls/FeedFilterBar";
import type { ItemDetails } from "@/components/item-detail-drawer/item-detail-drawer";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { useAuth } from "@clerk/clerk-react";
import { SignInCTA } from "@/components/SignInCTA";
import { AiLimitNotice } from "@/components/AiLimitNotice";
import { NewsletterCard } from "@/components/newsletter-card/NewsletterCard";
import { GenerationTrace } from "@/components/generation-trace";
import { RefineResultsCTA } from "@/components/RefineResultsCTA";
import { ERROR_MESSAGES, ERROR_CODES, MAX_FEED_GENERATION_COUNT } from "../../convex/constants";
import { AI_USAGE_CYCLE_MS } from "../../convex/lib/aiPlanLimits";
import { convexErrorData } from "../../convex/lib/errorData";
import { cn } from "@/lib/utils";
import { captureAnalytics } from "@/lib/analytics";

const compareByTextLength = (a: Doc<"questions">, b: Doc<"questions">) =>
  (a.text || a.customText || "").length - (b.text || b.customText || "").length;

const sortAnchoredBatch = (questions: Doc<"questions">[], anchoredCount: number) => [
  ...questions.slice(0, anchoredCount).sort(compareByTextLength),
  ...questions.slice(anchoredCount).sort(compareByTextLength),
];


/** What the limit notice says: the server's allowance, and the day the cycle resets when it is known. */
function aiLimitDescription(user: { aiLimit?: number; aiUsage?: { cycleStart?: number } } | null | undefined) {
  const used = user?.aiLimit !== undefined
    ? `You've used all ${user.aiLimit} AI generations for this cycle.`
    : "You've used all your AI generations for this cycle.";
  const cycleStart = user?.aiUsage?.cycleStart;
  if (cycleStart === undefined) return used;
  const resetsOn = new Date(cycleStart + AI_USAGE_CYCLE_MS).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return `${used} More become available on ${resetsOn}.`;
}

// What started a load: the page opening, the scroll reaching the end, the Load More button,
// or the reader getting within PREFETCH_WHEN_REMAINING cards of the end.
type FeedLoadTrigger = "initial" | "scroll" | "button" | "prefetch";

// A load starts when this many cards or fewer are left below the one being read, so a
// generated batch (about 12 s) is usually there before the reader reaches the end.
const PREFETCH_WHEN_REMAINING = 5;

/** The page's id for one generation request, so it can follow that request's progress. */
function newProgressKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context, which a phone testing over the local network isn't.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The spinner and the Load More button sit in about the last 300 px of the page.
const isAtFeedEnd = () =>
  window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 300;

export default function InfiniteScrollPage() {
  const { effectiveTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const convex = useConvex();
  const user = useAuth();
  const generateAIQuestions = useAction(api.core.ai.generateAIQuestionForFeed);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const anchoredStyleParam = searchParams.get("style");
  const anchoredToneParam = searchParams.get("tone");
  const anchoredTopicParam = searchParams.get("topic");


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
    removeHiddenStyle,
    removeHiddenTone,
    addQuestionToHistory,
    sessionId: localSessionId,
  } = useStorageContext();

  const [questions, setQuestions] = useState<Doc<"questions">[]>([]);
  const [seenIds, setSeenIds] = useState<Set<Id<"questions">>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [showTopButton, setShowTopButton] = useState(false);
  const [showAuthCTA, setShowAuthCTA] = useState(false);
  const [showAiLimitNotice, setShowAiLimitNotice] = useState(false);
  // Why new questions stopped coming (daily budget spent, too many requests), kept on the
  // page after the toast is gone so the end of the feed explains itself.
  const [pausedNotice, setPausedNotice] = useState<string | null>(null);
  // The generation request the page is waiting on, whose live steps replace the spinner.
  const [progressKey, setProgressKey] = useState<string | null>(null);
  const generationProgress = useQuery(
    api.core.generationProgress.getGenerationProgress,
    progressKey ? { requestKey: progressKey } : "skip",
  );
  const [takeoverDismissed, setTakeoverDismissed] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Doc<"questions"> | null>(null);
  // Questions hidden a moment ago: each shows an Undo notice in place of its card until its
  // countdown ends, then leaves the feed. The value records whether the hide also unliked it.
  const [pendingHides, setPendingHides] = useState<Record<string, { wasLiked: boolean }>>({});
  const [ctaAnchors, setCtaAnchors] = useState<CtaAnchors>({});
  const collapsingCards = useRef(new Set<() => void>());
  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  // Fetch all styles and tones for card rendering
  const allStyles = useQuery(api.core.styles.getStyles, {});
  const allTones = useQuery(api.core.tones.getTones, {});
  const allTopics = useQuery(api.core.topics.getTopics, {});
  const activeTakeoverTopics = useQuery(api.core.topics.getActiveTakeoverTopics);
  const interactionStats = useQuery(api.core.users.getUserInteractionStats, {});
  const dismissRefineCTA = useMutation(api.core.users.dismissRefineCTA);
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);

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
    const map = new Map<string, any>();
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

  const colorObserverRef = useRef<IntersectionObserver | null>(null);
  const visibleColorCards = useRef(new Set<string>());
  const questionsById = useMemo(() => new Map(questions.map(question => [String(question._id), question])), [questions]);
  const questionsByIdRef = useRef(questionsById);
  questionsByIdRef.current = questionsById;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isLoadingRef = useRef(false);
  // When the reader last reached the end of the feed during the load in flight, or null while
  // they have cards left to read. Each stretch at the end is added to the load's stall time.
  const atFeedEndSinceRef = useRef<number | null>(null);
  // Set when a load asked ahead of the reader was refused the person's last AI request, so the
  // feed stops asking ahead until they reach its end or press Load More.
  const heldLastRequestRef = useRef(false);
  // The feed's length when the last prefetch started, so a prefetch that adds nothing isn't
  // sent again until the feed grows.
  const prefetchedAtLengthRef = useRef(0);
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

  const setQuestionRef = useCallback((element: HTMLDivElement | null, questionId: string) => {
    if (element) {
      cardRefs.current.set(questionId, element);
      observerRef.current?.observe(element);
      colorObserverRef.current?.observe(element);
    } else {
      const el = cardRefs.current.get(questionId);
      if (el) {
        observerRef.current?.unobserve(el);
        colorObserverRef.current?.unobserve(el);
        visibleColorCards.current.delete(questionId);
        cardRefs.current.delete(questionId);
      }
    }
  }, []);

  useEffect(() => {
    const collapsing = collapsingCards.current;
    return () => {
      collapsing.forEach((stop) => stop());
      collapsing.clear();
    };
  }, []);

  // Track the card at the center of the viewport for view analytics.
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
      colorObserverRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Track view duration
  // Set once AI generation is paused (daily budget) or rate-limited, so later pages
  // stop asking for AI questions for the rest of the session.
  const aiPausedRef = useRef(false);
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
          sessionId: localSessionId || undefined,
        }); // No catch here as it might run during unmount

        if (duration > 1000) {
          addQuestionToHistory({
            question: activeQuestionRef.current,
            viewedAt: Date.now(),
          });
        }
      }
    };
  }, [activeQuestion, recordAnalytics, addQuestionToHistory, localSessionId]);


  // Check if all styles or tones are blocked
  const allStylesBlocked = useMemo(() => {
    if (!allStyles || allStyles.length === 0 || !hiddenStyles) return false;
    return allStyles.every(s => hiddenStyles.includes(s._id));
  }, [allStyles, hiddenStyles]);

  const allTonesBlocked = useMemo(() => {
    if (!allTones || allTones.length === 0 || !hiddenTones) return false;
    return allTones.every(t => hiddenTones.includes(t._id));
  }, [allTones, hiddenTones]);

  const isDarkTheme = effectiveTheme === "dark";



  // Function to load more questions
  const loadMoreQuestions = useCallback(async (trigger: FeedLoadTrigger = "scroll") => {
    // Check if we are already loading or missing params
    const isStorageLoaded = hiddenStyles !== undefined && hiddenTones !== undefined &&
      (!user.isSignedIn || (hiddenStyles !== null && hiddenTones !== null));

    if (!user.isLoaded || !anchorParamsReady || isLoadingRef.current || !hasMore || allStylesBlocked || allTonesBlocked || !isStorageLoaded) return;

    // A load asked ahead of the reader (a prefetch, or the scroll handler firing before the
    // end of the feed) never spends a person's last AI request: that one waits until they
    // reach the end, or press Load More.
    const ahead = trigger === "prefetch" || (trigger === "scroll" && !isAtFeedEnd());
    if (ahead && heldLastRequestRef.current) return;
    if (!ahead) heldLastRequestRef.current = false;

    // Capture current request ID
    requestIdRef.current++;
    const currentRequestId = requestIdRef.current;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    const isFirstPull = questionsRef.current.length === 0;
    const hasAnchors = !!(anchoredStyleId || anchoredToneId || anchoredTopicId);
    const loadStartedAt = performance.now();
    atFeedEndSinceRef.current = isAtFeedEnd() ? loadStartedAt : null;
    // Time the reader spent at the end of the feed with nothing new to read. A stretch ends
    // when cards are added below them, and another begins if they reach the new end.
    let stalledMs = 0;
    const endStall = () => {
      const since = atFeedEndSinceRef.current;
      if (since === null || currentRequestId !== requestIdRef.current) return;
      stalledMs += performance.now() - since;
      atFeedEndSinceRef.current = null;
    };
    const addsCards = (batch: { _id: Id<"questions"> }[]) => {
      const shown = new Set(questionsRef.current.map((question) => question._id));
      return batch.some((question) => !shown.has(question._id));
    };
    const timing: {
      libraryMs?: number;
      libraryCount?: number;
      generationRequested: number;
      generationMs?: number;
      generatedCount: number;
      failed: boolean;
    } = { generationRequested: 0, generatedCount: 0, failed: false };
    // The server refuses to spend the last request on a load asked ahead (AI_LAST_REQUEST_HELD),
    // judged on the count when the request is recorded. This check on the page's own copy of
    // the count only saves the round trip.
    const requestsLeft =
      typeof currentUser?.aiLimit === "number" && typeof currentUser?.aiUsage?.count === "number"
        ? currentUser.aiLimit - currentUser.aiUsage.count
        : null;
    const holdsLastRequest = ahead && requestsLeft !== null && requestsLeft <= 1;
    const isLastRequestHeld = (err: unknown) => convexErrorData(err)?.code === ERROR_CODES.AI_LAST_REQUEST_HELD;
    const followProgress = () => {
      const key = newProgressKey();
      setProgressKey(key);
      return key;
    };
    const appendQuestions = (batch: Doc<"questions">[]) => {
      if (batch.length === 0) return;
      if (addsCards(batch)) endStall();
      setQuestions((previous) => {
        const previousIds = new Set(previous.map((question) => question._id));
        const uniqueNew = batch.filter((question) => !previousIds.has(question._id));
        return uniqueNew.length === 0 ? previous : [...previous, ...uniqueNew];
      });
      setSeenIds((previous) => {
        const next = new Set(previous);
        batch.forEach((question) => next.add(question._id));
        return next;
      });
    };

    try {
      const BATCH_SIZE = isFirstPull ? 10 : 5;

      if (hasAnchors) {
        const feedBatch = await convex.action(api.core.questions.getNextRandomQuestions, {
          count: BATCH_SIZE,
          seen: Array.from(seenIds),
          hidden: hiddenQuestions,
          hiddenStyles: hiddenStyles ?? [],
          hiddenTones: hiddenTones ?? [],
          randomSeed: Math.random(),
          anchoredStyleId: anchoredStyleId ?? undefined,
          anchoredToneId: anchoredToneId ?? undefined,
          anchoredTopicId: anchoredTopicId ?? undefined,
        });

        if (currentRequestId !== requestIdRef.current) return;

        const dbQuestions = Array.isArray(feedBatch) ? feedBatch : feedBatch.questions;
        timing.libraryMs = performance.now() - loadStartedAt;
        timing.libraryCount = dbQuestions.length;
        const anchoredMatchCount = Array.isArray(feedBatch) ? 0 : feedBatch.anchoredMatchCount;
        const targetAnchoredCount = Array.isArray(feedBatch) ? Math.min(BATCH_SIZE, BATCH_SIZE >= 10 ? 6 : Math.ceil(BATCH_SIZE * 0.6)) : feedBatch.targetAnchoredCount;
        const anchoredQuestions = dbQuestions.slice(0, anchoredMatchCount);
        const generalQuestions = dbQuestions.slice(anchoredMatchCount);
        const anchorShortfall = Math.max(0, targetAnchoredCount - anchoredQuestions.length);
        const totalShortfall = Math.max(0, BATCH_SIZE - dbQuestions.length);
        const generationCount = Math.min(MAX_FEED_GENERATION_COUNT, Math.max(anchorShortfall, totalShortfall));
        let generatedQuestions: Doc<"questions">[] = [];
        const canGenerate = generationCount > 0 && user.isSignedIn && !currentUser?.isAiLimitReached && !aiPausedRef.current;
        // The library's questions go on screen at once and the generated ones follow when
        // they arrive, on the first page too: reading starts straight away instead of after
        // the wait for new questions. Each part of the first page is sorted shortest first.
        const shownEarly = dbQuestions.length > 0 && canGenerate;
        if (shownEarly) {
          appendQuestions(isFirstPull
            ? sortAnchoredBatch(dbQuestions as Doc<"questions">[], anchoredMatchCount)
            : dbQuestions as Doc<"questions">[]);
        }

        if (canGenerate && holdsLastRequest) {
          heldLastRequestRef.current = true;
          if (!shownEarly) appendQuestions(dbQuestions as Doc<"questions">[]);
          return;
        }

        if (canGenerate) {
          const generationStartedAt = performance.now();
          timing.generationRequested = generationCount;
          try {
            const generated = await generateAIQuestions({
              count: generationCount,
              anchoredStyleId: anchoredStyleId ?? undefined,
              anchoredToneId: anchoredToneId ?? undefined,
              anchoredTopicId: anchoredTopicId ?? undefined,
              ...(ahead ? { ahead: true } : {}),
              progressKey: followProgress(),
            });
            timing.generationMs = performance.now() - generationStartedAt;
            if (currentRequestId !== requestIdRef.current) return;
            generatedQuestions = (generated || []).filter((question): question is Doc<"questions"> => question !== null);
            timing.generatedCount = generatedQuestions.length;
          } catch (err) {
            timing.generationMs = performance.now() - generationStartedAt;
            if (currentRequestId !== requestIdRef.current) return;
            if (isLastRequestHeld(err)) {
              heldLastRequestRef.current = true;
              if (!shownEarly) appendQuestions(dbQuestions as Doc<"questions">[]);
              return;
            }
            timing.failed = true;
            console.error("Anchored AI generation failed:", err);

            const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err);
            const errorCode = convexErrorData(err)?.code ?? null;
            const errorDataMessage = convexErrorData(err)?.message ?? null;
            const isLimitError =
              errorCode === ERROR_CODES.AI_LIMIT_REACHED ||
              errorMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
              errorDataMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
              errorMessage.includes("AI generation limit reached");

            if (totalShortfall > 0 && isLimitError) {
              setShowAiLimitNotice(true);
              setHasMore(false);
            } else if (errorCode === ERROR_CODES.AI_BUDGET_PAUSED || errorCode === ERROR_CODES.AI_RATE_LIMITED || errorCode === ERROR_CODES.AI_PROMPT_TOO_LARGE) {
              // The daily AI budget is spent or this user is rate-limited: show what's left
              // and stop asking for more, including anchor top-ups on later pages.
              aiPausedRef.current = true;
              if (totalShortfall > 0) setHasMore(false);
              setPausedNotice(typeof errorDataMessage === "string" ? errorDataMessage : ERROR_MESSAGES.AI_BUDGET_PAUSED);
              toast.info(typeof errorDataMessage === "string" ? errorDataMessage : ERROR_MESSAGES.AI_BUDGET_PAUSED);
            } else if (dbQuestions.length === 0) {
              if (isFirstPull) setLoadError("Couldn't load questions.");
              else toast.error("Couldn't load more questions. Scroll to retry.");
            }
          }
        } else if (totalShortfall > 0) {
          if (!user.isSignedIn) setShowAuthCTA(true);
          if (currentUser?.isAiLimitReached) setShowAiLimitNotice(true);
          setHasMore(false);
        }

        const existingIds = new Set(dbQuestions.map((question) => question._id));
        const uniqueGenerated = generatedQuestions.filter((question) => !existingIds.has(question._id));
        if (shownEarly) {
          appendQuestions(isFirstPull ? [...uniqueGenerated].sort(compareByTextLength) : uniqueGenerated);
          return;
        }
        const generatedAnchoredCount = Math.max(0, targetAnchoredCount - anchoredQuestions.length);
        const finalAnchored = [...anchoredQuestions, ...uniqueGenerated.slice(0, generatedAnchoredCount)];
        const generatedFallback = uniqueGenerated.slice(generatedAnchoredCount);
        const finalBatch = [...finalAnchored, ...generalQuestions, ...generatedFallback].slice(0, BATCH_SIZE);
        const orderedBatch = isFirstPull ? sortAnchoredBatch(finalBatch, finalAnchored.length) : finalBatch;

        if (orderedBatch.length === 0) {
          if (isFirstPull) setHasMore(false);
          else setSeenIds(new Set());
          return;
        }

        if (isFirstPull) {
          setQuestions(orderedBatch);
          setSeenIds(new Set(orderedBatch.map((question) => question._id)));
        } else {
          appendQuestions(orderedBatch);
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
        randomSeed: Math.random(),
        anchoredStyleId: anchoredStyleId ?? undefined,
        anchoredToneId: anchoredToneId ?? undefined,
        anchoredTopicId: anchoredTopicId ?? undefined,
      });
      const dbQuestions = Array.isArray(feedBatch) ? feedBatch : feedBatch.questions;

      // Check for staleness after await
      if (currentRequestId !== requestIdRef.current) return;
      timing.libraryMs = performance.now() - loadStartedAt;
      timing.libraryCount = dbQuestions.length;

      const combinedQuestions = [...dbQuestions];

      // The library's questions go on screen at once, on the first page too (sorted shortest
      // first there), so reading never waits on new questions being written.
      if (isFirstPull) combinedQuestions.sort(compareByTextLength);
      if (combinedQuestions.length > 0) {
        if (addsCards(combinedQuestions)) endStall();
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
          return;
        }

        // AI was paused or rate-limited earlier this session: what the database had is already on screen.
        if (aiPausedRef.current) {
          setHasMore(false);
          return;
        }

        // Proactively check for AI limit if we need more
        if (currentUser?.isAiLimitReached) {
          setShowAiLimitNotice(true);
          setHasMore(false);
          return;
        }

        // The library's questions, if any, are already on screen (a prefetch is never the
        // first page).
        if (holdsLastRequest) {
          heldLastRequestRef.current = true;
          return;
        }

        const generationStartedAt = performance.now();
        // A request costs about the same whether it asks for one question or five, and is
        // counted once against the person's limit, so it always asks for a full batch.
        timing.generationRequested = MAX_FEED_GENERATION_COUNT;
        try {
          const generated = await generateAIQuestions({
            count: MAX_FEED_GENERATION_COUNT,
            anchoredStyleId: anchoredStyleId ?? undefined,
            anchoredToneId: anchoredToneId ?? undefined,
            anchoredTopicId: anchoredTopicId ?? undefined,
            ...(ahead ? { ahead: true } : {}),
            progressKey: followProgress(),
          });
          timing.generationMs = performance.now() - generationStartedAt;

          // Check for staleness after generation await
          if (currentRequestId !== requestIdRef.current) return;

          const validGenerated = (generated || []).filter((q): q is Doc<"questions"> => q !== null);
          timing.generatedCount = validGenerated.length;
          const uniqueGenerated = validGenerated.filter(q => !combinedQuestions.some(cq => cq._id === q._id));

          // New questions go below the cards already on screen and never reorder them. On the
          // first page they are sorted shortest first among themselves.
          if (isFirstPull) uniqueGenerated.sort(compareByTextLength);
          if (isFirstPull && uniqueGenerated.length === 0 && dbQuestions.length === 0) {
            setHasMore(false);
          } else if (uniqueGenerated.length > 0) {
            if (addsCards(uniqueGenerated)) endStall();
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
            // DB returned nothing — likely the seen set covers the whole pool.
            // Reset seen IDs so the next scroll can re-sample, instead of
            // permanently killing hasMore.
            setSeenIds(new Set());
          }
        } catch (err) {
          timing.generationMs = performance.now() - generationStartedAt;
          if (currentRequestId !== requestIdRef.current) return;
          // A load asked ahead is never the first page, so the library's questions, if any,
          // are already on screen.
          if (isLastRequestHeld(err)) {
            heldLastRequestRef.current = true;
            return;
          }
          timing.failed = true;
          console.error("AI Generation failed:", err);

          const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : JSON.stringify(err));
          const errorCode = convexErrorData(err)?.code ?? null;
          const errorDataMessage = convexErrorData(err)?.message ?? null;

          // Use structured error code if available, otherwise fall back to exact constant match or conservative substring check
          const isLimitError = errorCode === ERROR_CODES.AI_LIMIT_REACHED ||
            errorMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
            errorDataMessage === ERROR_MESSAGES.AI_LIMIT_REACHED ||
            errorMessage.includes("AI generation limit reached");

          if (errorMessage.includes("logged in")) {
            setShowAuthCTA(true);
            setHasMore(false);
          } else if (isLimitError) {
            setShowAiLimitNotice(true);
            setHasMore(false);
          } else if (errorCode === ERROR_CODES.AI_BUDGET_PAUSED || errorCode === ERROR_CODES.AI_RATE_LIMITED || errorCode === ERROR_CODES.AI_PROMPT_TOO_LARGE) {
            // The daily AI budget is spent or this user is rate-limited: stop asking for
            // more. The block below still shows what the database had on the first pull.
            aiPausedRef.current = true;
            setHasMore(false);
            setPausedNotice(typeof errorDataMessage === "string" ? errorDataMessage : ERROR_MESSAGES.AI_BUDGET_PAUSED);
            toast.info(typeof errorDataMessage === "string" ? errorDataMessage : ERROR_MESSAGES.AI_BUDGET_PAUSED);
          } else if (dbQuestions.length === 0) {
            // Generic AI failure and no DB questions — reset seen IDs so
            // the next scroll attempt can re-sample the pool instead of
            // permanently stopping.
            setSeenIds(new Set());
            if (isFirstPull) setLoadError("Couldn't load questions.");
            else toast.error("Couldn't load more questions. Scroll to retry.");
          }

          // The library's questions, if any, are already on screen; with none, the first
          // page has nothing to show.
          if (isFirstPull && combinedQuestions.length === 0) {
            setHasMore(false);
          }
        }
      }
    } catch (error) {
      timing.failed = true;
      console.error("Error fetching questions:", error);
      if (currentRequestId !== requestIdRef.current) return;

      // The raw error is in the console; people get a plain message and a way to retry.
      const errorMessage = "Couldn't load more questions. Check your connection and try again.";
      setLoadError(errorMessage);
      toast.error(errorMessage, {
        action: {
          label: "Retry",
          onClick: () => {
            setLoadError(null);
            // An empty feed stopped asking for more when the load failed; turning that back
            // on starts the first load again. Otherwise ask for the next page.
            if (questionsRef.current.length === 0) setHasMore(true);
            else void loadMoreQuestionsRef.current("button");
          },
        },
      });

      // Stop the infinite loop if we can't get any questions at all
      if (questionsRef.current.length === 0) {
        setHasMore(false);
      }
    } finally {
      // Only reset loading if this request is still the active one
      if (currentRequestId === requestIdRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
        setProgressKey(null);

        endStall();
        const finishedAt = performance.now();
        const round = (ms: number | undefined) => (ms === undefined ? undefined : Math.round(ms));
        const properties = {
          trigger,
          first_pull: isFirstPull,
          anchored: hasAnchors,
          total_ms: round(finishedAt - loadStartedAt),
          // How long the reader sat at the end of the feed with nothing new to read.
          stall_ms: round(stalledMs),
          ahead,
          library_ms: round(timing.libraryMs),
          library_count: timing.libraryCount,
          generation_requested: timing.generationRequested,
          generation_ms: round(timing.generationMs),
          generated_count: timing.generatedCount,
          failed: timing.failed,
        };
        captureAnalytics("feed_load", properties);
        if (import.meta.env.DEV) console.debug("feed_load", properties);
      }
    }
  }, [convex, seenIds, hiddenQuestions, hiddenStyles, hiddenTones, generateAIQuestions, user.isSignedIn, allStylesBlocked, allTonesBlocked, currentUser, hasMore, user.isLoaded, anchoredStyleId, anchoredToneId, anchoredTopicId, anchorParamsReady]);

  // Reset the request and its loading state together when the feed changes.
  useEffect(() => {
    setQuestions([]);
    const currentQuestionId = activeQuestionRef.current?._id;
    setSeenIds(currentQuestionId ? new Set([currentQuestionId]) : new Set());
    requestIdRef.current++;
    // The discarded request cannot release this lock in its finally block.
    isLoadingRef.current = false;
    atFeedEndSinceRef.current = null;
    heldLastRequestRef.current = false;
    prefetchedAtLengthRef.current = 0;
    setIsLoading(false);
    setProgressKey(null);
    setLoadError(null);
    setHasMore(true);
    setShowAuthCTA(false);
    setShowAiLimitNotice(false);
  }, [anchoredStyleId, anchoredToneId, anchoredTopicId]);

  // Initial load
  useEffect(() => {
    if (questions.length === 0 && hasMore) {
      void loadMoreQuestions("initial");
    }
  }, [questions.length, hasMore, loadMoreQuestions]);

  // Prefetch: start the next load while the reader still has a few cards left.
  const loadMoreQuestionsRef = useRef(loadMoreQuestions);
  loadMoreQuestionsRef.current = loadMoreQuestions;
  useEffect(() => {
    if (!activeQuestion || !hasMore || isLoadingRef.current) return;
    const index = questions.findIndex((question) => question._id === activeQuestion._id);
    if (index < 0) return;
    const remaining = questions.length - 1 - index;
    if (remaining > PREFETCH_WHEN_REMAINING || prefetchedAtLengthRef.current === questions.length) return;
    prefetchedAtLengthRef.current = questions.length;
    void loadMoreQuestionsRef.current("prefetch");
  }, [activeQuestion, questions, hasMore]);

  useEffect(() => {
    if (allStylesBlocked || allTonesBlocked) {
      setQuestions([]);
      setSeenIds(new Set());
      setHasMore(true);
      setShowAuthCTA(false);
      setShowAiLimitNotice(false);
    }
  }, [allStylesBlocked, allTonesBlocked]);

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      // Increased threshold to 1000px for pre-emptive loading
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        void loadMoreQuestions("scroll");
      }
      if (isLoadingRef.current && atFeedEndSinceRef.current === null && isAtFeedEnd()) {
        atFeedEndSinceRef.current = performance.now();
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
        toast.success("Removed from Liked");
      } else {
        // If it was hidden, remove it from hidden
        if (hiddenQuestions.includes(questionId)) {
          removeHiddenQuestion(questionId);
        }
        addLikedQuestion(questionId);
        // Counting the like is separate from saving it: a failure there is not the person's problem.
        void recordAnalytics({
          questionId,
          event: "liked",
          viewDuration: 0, // Not tracking duration in list view accurately
          // The local session id, not Clerk's: signed-out visitors have no Clerk session,
          // and an anonymous like only counts once per local session.
          sessionId: localSessionId || undefined,
        }).catch((error) => console.error("Error recording like:", error));
        toast.success("Added to Liked", {
          action: {
            label: "Open liked",
            onClick: () => {
              void navigate("/liked");
            },
          },
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      toast.error("Couldn't update Liked. Please try again.");
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
        const wasLiked = likedQuestions.includes(questionId);
        if (wasLiked) {
          removeLikedQuestion(questionId);
        }
        addHiddenQuestion(questionId);
        void recordAnalytics({
          questionId,
          event: "hidden",
          viewDuration: 0,
        });
        // The card turns into a notice with Undo and a countdown, so no toast is needed.
        setPendingHides((previous) => ({ ...previous, [questionId]: { wasLiked } }));
      }
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  }

  const forgetPendingHide = (questionId: Id<"questions">) =>
    setPendingHides((previous) => {
      const { [questionId]: _done, ...rest } = previous;
      return rest;
    });
  // Undo puts back both changes: the question is shown again, and liked again if it was.
  const undoHide = (questionId: Id<"questions">) => {
    const wasLiked = pendingHides[questionId]?.wasLiked;
    removeHiddenQuestion(questionId);
    if (wasLiked) addLikedQuestion(questionId);
    forgetPendingHide(questionId);
  };
  // The countdown ended: the question stays hidden and its card leaves the feed.
  const finishHide = (questionId: Id<"questions">) => {
    const removeCard = () => {
      const feed = questionsRef.current;
      setCtaAnchors((anchors) => keepCtasInPlace(feed, anchors, questionId));
      setQuestions((previous) => previous.filter((question) => question._id !== questionId));
      forgetPendingHide(questionId);
    };
    const card = cardRefs.current.get(questionId);
    const stopCollapse = card && !reduceMotion
      ? collapseFeedCard(card, () => {
          if (stopCollapse) collapsingCards.current.delete(stopCollapse);
          removeCard();
        })
      : null;
    if (stopCollapse) collapsingCards.current.add(stopCollapse);
    else removeCard();
  };

  // Hiding a style or tone takes its cards off the screen and leaves the rest where they
  // are, so the reader keeps their place. Undo shows that style or tone again from here on.
  const handleHideStyle = (styleId: Id<"styles">) => {
    addHiddenStyle(styleId);
    setQuestions((previous) => previous.filter((question) => stylesMap.get(question.styleId || question.style || "")?._id !== styleId));
    toast.success("Style hidden", {
      action: { label: "Undo", onClick: () => removeHiddenStyle(styleId) },
    });
  }

  const handleHideTone = (toneId: Id<"tones">) => {
    addHiddenTone(toneId);
    setQuestions((previous) => previous.filter((question) => tonesMap.get(question.toneId || question.tone || "")?._id !== toneId));
    toast.success("Tone hidden", {
      action: { label: "Undo", onClick: () => removeHiddenTone(toneId) },
    });
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

  const setFilter = (key: FeedFilterKey, slug: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (slug) newParams.set(key, slug);
    else newParams.delete(key);
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    const newParams = new URLSearchParams(searchParams);
    ["style", "tone", "topic"].forEach((key) => newParams.delete(key));
    setSearchParams(newParams);
  };

  // What the filter bar offers. A hidden style or tone is left out, unless it is the one
  // already chosen (from a shared link, say), so the pill can still name it.
  const filterStyles = useMemo<FeedFilterOption[]>(
    () => (allStyles ?? [])
      .filter((style) => !hiddenStyles?.includes(style._id) || style._id === anchoredStyleId)
      .map((style) => ({ _id: style._id, slug: style.slug ?? style.id, name: style.name, description: style.description, icon: style.icon, color: style.color })),
    [allStyles, hiddenStyles, anchoredStyleId],
  );
  const filterTones = useMemo<FeedFilterOption[]>(
    () => (allTones ?? [])
      .filter((tone) => !hiddenTones?.includes(tone._id) || tone._id === anchoredToneId)
      .map((tone) => ({ _id: tone._id, slug: tone.slug ?? tone.id, name: tone.name, description: tone.description, icon: tone.icon, color: tone.color })),
    [allTones, hiddenTones, anchoredToneId],
  );
  const filterTopics = useMemo<FeedFilterOption[]>(
    () => (allTopics ?? []).map((topic) => ({ _id: topic._id, slug: topic.slug ?? topic.id, name: topic.name, description: topic.description, icon: topic.icon, color: topic.color })),
    [allTopics],
  );

  const hasAnchorFilters = !!(anchoredStyleParam || anchoredToneParam || anchoredTopicParam);

  // When few AI generations are left, the feed says so before they run out: scrolling here
  // is what spends them.
  const aiLeft = user.isSignedIn && typeof currentUser?.aiLimit === "number" && Number.isFinite(currentUser.aiLimit)
    ? Math.max(0, currentUser.aiLimit - (currentUser.aiUsage?.count ?? 0))
    : null;
  const aiRunningLow = aiLeft !== null && aiLeft > 0 && typeof currentUser?.aiLimit === "number"
    && aiLeft <= Math.max(3, currentUser.aiLimit * 0.2);
  const aiResetsOn = currentUser?.aiUsage?.cycleStart === undefined
    ? null
    : new Date(currentUser.aiUsage.cycleStart + AI_USAGE_CYCLE_MS).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  // Smooth ambient aura transition logic
  const [bgGradient, setBgGradient] = useState<[string, string]>(["#0E7490", "#6366F1"]);

  const showRefineCTA = interactionStats &&
    interactionStats.totalSeen >= 50 &&
    interactionStats.totalLikes === 0 &&
    !interactionStats.dismissedRefineCTA;

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
    if (reduceMotion) {
      setBgGradient(['#667EEA', '#764BA2']);
      return;
    }
    const visibleCards = visibleColorCards.current;
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

      visibleCards.forEach((questionId) => {
        const q = questionsByIdRef.current.get(questionId);
        const el = cardRefs.current.get(questionId);
        if (!el || !q) return;

        const rect = el.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const dist = Math.abs(cardCenter - centerY);

        if (dist < range) {
          // Weight follows a cosine overlap or linear curve
          // Using Math.max(0, 1 - dist/range) gives a linear falloff
          // Squaring it makes the transition smoother at the extremes
          const weight = Math.pow(Math.max(0, 1 - dist / range), 2);

          if (weight > 0) {
            const s = (q.styleId || q.style) ? stylesMapRef.current.get(q.styleId || q.style || "") : undefined;
            const t = (q.toneId || q.tone) ? tonesMapRef.current.get(q.toneId || q.tone || "") : undefined;
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

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handleScrollColor();
      });
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.getAttribute('data-question-id');
        if (!id) continue;
        if (entry.isIntersecting) visibleCards.add(id);
        else visibleCards.delete(id);
      }
      onScroll();
    }, { rootMargin: '67% 0px' });
    colorObserverRef.current = observer;
    cardRefs.current.forEach(element => observer.observe(element));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    return () => {
      observer.disconnect();
      colorObserverRef.current = null;
      visibleCards.clear();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [reduceMotion]);
  const newsletterHolderId = ctaHolderId(questions, ctaAnchors, "newsletter");
  const refineHolderId = ctaHolderId(questions, ctaAnchors, "refine");
  const filterButton = (
    <FeedFilterBar
      styles={filterStyles}
      tones={filterTones}
      topics={filterTopics}
      selectedStyleId={anchoredStyleId}
      selectedToneId={anchoredToneId}
      selectedTopicId={anchoredTopicId}
      onChange={setFilter}
      onClearAll={clearFilters}
      hiddenStyleCount={(allStyles ?? []).length - filterStyles.length}
      hiddenToneCount={(allTones ?? []).length - filterTones.length}
      hideActiveChips
      compact
    />
  );

  return (
    <div className="deck-canvas relative min-h-screen overflow-x-clip flex flex-col">
      {/* Subtle scroll-reactive ambient tint from the active card's style & tone */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: isDarkTheme
            ? `radial-gradient(55% 45% at 18% 12%, color-mix(in srgb, ${bgGradient[0]} 20%, transparent), transparent 72%), radial-gradient(55% 45% at 84% 80%, color-mix(in srgb, ${bgGradient[1]} 18%, transparent), transparent 72%)`
            : `radial-gradient(55% 45% at 18% 12%, color-mix(in srgb, ${bgGradient[0]} 15%, transparent), transparent 72%), radial-gradient(55% 45% at 84% 80%, color-mix(in srgb, ${bgGradient[1]} 14%, transparent), transparent 72%)`,
          transition: reduceMotion ? "none" : "background 0.25s ease-out",
        }}
      />

      <Header rightSlot={filterButton} />

      <main className="relative z-10 flex-1 flex flex-col pb-32 pt-[var(--header-h,4rem)]">
        <h1 className="sr-only">Questions</h1>
        <div
          className={cn(
            "flex flex-col gap-6 px-4 pt-6 sm:pt-8 max-w-3xl mx-auto w-full"
          )}
        >
          {/* Active filter chips only appear when at least one filter is active */}
          <ActiveFilterChips
            styles={filterStyles}
            tones={filterTones}
            topics={filterTopics}
            selectedStyleId={anchoredStyleId}
            selectedToneId={anchoredToneId}
            selectedTopicId={anchoredTopicId}
            onChange={setFilter}
            onClearAll={clearFilters}
          />

          {aiRunningLow && !showAiLimitNotice && (
            <p
              role="status"
              className="mx-auto w-fit max-w-md rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-foreground"
            >
              {aiLeft === 1 ? "1 AI generation left" : `${aiLeft} AI generations left`} this cycle. New questions and Remix use them
              {aiResetsOn ? `; more arrive on ${aiResetsOn}.` : "."}
            </p>
          )}

          {(allStylesBlocked || allTonesBlocked) && (
            <div className="deck-card mx-auto flex w-full max-w-md flex-col items-center justify-center space-y-4 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <SearchX className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold tracking-[-0.02em] text-card-foreground">
                  {allStylesBlocked ? "All Styles Hidden" : "All Tones Hidden"}
                </h3>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {allStylesBlocked
                    ? "You have hidden all available question styles. Unhide some styles in Settings to see more questions."
                    : "You have hidden all available tones. Unhide some tones in Settings to see more questions."}
                </p>
              </div>
              <Button variant="default" className="min-h-11 rounded-full px-6" asChild>
                <Link to="/settings">Manage preferences</Link>
              </Button>
            </div>
          )}

          {/* A sign-in prompt or limit notice explains an empty feed on its own; this panel
              would only contradict it. */}
          {!allStylesBlocked && !allTonesBlocked && questions.length === 0 && !hasMore && !isLoading && (loadError || (!showAuthCTA && !showAiLimitNotice && !pausedNotice)) && (
            <div className="deck-card mx-auto flex w-full max-w-md flex-col items-center justify-center space-y-5 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <SearchX className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-bold tracking-[-0.02em] text-card-foreground">
                  {loadError ? "Couldn’t load questions" : "No matching questions"}
                </h3>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {loadError
                    ? loadError
                    : hasAnchorFilters
                      ? "Nothing matches your current style, tone, or topic filters."
                      : "There's nothing new to show right now."}
                </p>
              </div>
              <Button
                variant="default"
                className="min-h-11 rounded-full px-7 font-semibold"
                onClick={() => {
                  if (!loadError && hasAnchorFilters) {
                    const newParams = new URLSearchParams(searchParams);
                    ["style", "tone", "topic"].forEach((key) => newParams.delete(key));
                    setSearchParams(newParams);
                  }
                  setHasMore(true);
                  setLoadError(null);
                }}
              >
                {!loadError && hasAnchorFilters ? "Clear Filters" : "Try Again"}
              </Button>
            </div>
          )}

          {!allStylesBlocked && !allTonesBlocked && questions.map((question, index) => {
            const cardStyle = stylesMap.get(question.styleId || (question.style as string) || "");
            const cardTone = tonesMap.get(question.toneId || (question.tone as string) || "");
            const cardGradient = (cardStyle?.color && cardTone?.color)
              ? [cardStyle.color, cardTone.color]
              : ["#0E7490", "#6366F1"];

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
                    // Keeps the Hide label steady while the card fades into its notice.
                    isHidden={hiddenQuestions.includes(question._id) && !pendingHides[question._id]}
                    hiddenNotice={
                      pendingHides[question._id] ? (
                        <HiddenCardNotice
                          wasLiked={pendingHides[question._id].wasLiked}
                          onUndo={() => undoHide(question._id)}
                          onExpire={() => finishHide(question._id)}
                        />
                      ) : undefined
                    }
                    gradient={cardGradient}
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

                {/* Newsletter Card: after the 5th question, and stays put when cards leave */}
                {question._id === newsletterHolderId && user.isLoaded && (
                  !user.isSignedIn ||
                  (currentUser && !currentUser.newsletterSubscriptionStatus)
                ) && (
                    <NewsletterCard
                      variant="blend"
                      prefilledEmail={user.isSignedIn ? currentUser?.email : undefined}
                    />
                  )}

                {/* Refine Results CTA: after the 10th question, and stays put when cards leave */}
                {question._id === refineHolderId && showRefineCTA && (
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

          {isLoading && progressKey && <GenerationTrace key={progressKey} stage={generationProgress?.stage} />}

          {((isLoading && !progressKey) || (!user.isLoaded && questions.length === 0)) && (
            <div className="flex flex-col items-center gap-3 py-8" role="status">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-muted-foreground">
                {questions.length === 0
                  ? (user.isSignedIn ? "Finding questions… new ones can take a few seconds to write." : "Finding questions…")
                  : "Loading more questions…"}
              </span>
            </div>
          )}

          {loadError && questions.length > 0 && !isLoading && (
            <div role="alert" className="deck-card mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 py-5 text-center">
              <p className="text-sm font-medium text-foreground">{loadError}</p>
              <Button
                variant="outline"
                className="min-h-11 rounded-full px-6"
                onClick={() => {
                  setLoadError(null);
                  void loadMoreQuestions("button");
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {showAuthCTA && (
            <SignInCTA
              bgGradient={bgGradient}
              title={hasAnchorFilters ? "That's every question for these filters" : "Want more questions?"}
              featureHighlight={{
                pre: "Sign in to get",
                highlight: import.meta.env.VITE_MAX_FREE_AIGEN
                  ? `${import.meta.env.VITE_MAX_FREE_AIGEN} free AI generations`
                  : "free AI generations",
                post: "every month!"
              }}
            />
          )}

          {pausedNotice && !hasMore && !isLoading && (
            <AiLimitNotice title="New questions are paused" description={`${pausedNotice} The questions already here are still yours to browse.`} />
          )}

          {(showAuthCTA || showAiLimitNotice || (pausedNotice && !hasMore)) && !isLoading && !hasAnchorFilters && questions.length > 0 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="min-h-11 rounded-full bg-card px-6 font-semibold"
                onClick={() => {
                  setSeenIds(new Set());
                  setQuestions([]);
                  setShowAuthCTA(false);
                  setShowAiLimitNotice(false);
                  setHasMore(true);
                  window.scrollTo({ top: 0 });
                }}
              >
                Start again from the top
              </Button>
            </div>
          )}

          {(showAuthCTA || showAiLimitNotice) && hasAnchorFilters && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="min-h-11 rounded-full bg-card px-6 font-semibold"
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  ["style", "tone", "topic"].forEach((key) => newParams.delete(key));
                  setSearchParams(newParams);
                }}
              >
                Clear filters
              </Button>
            </div>
          )}

          {showAiLimitNotice && (
            <AiLimitNotice
              title="Generation Limit Reached"
              description={aiLimitDescription(currentUser)}
            />
          )}

          {hasMore && user.isLoaded && !showAuthCTA && !showAiLimitNotice && !loadError && (questions.length > 0 || !isLoading) && (
            <div className="flex justify-center py-6">
              <Button
                variant="outline"
                className="min-h-11 rounded-full bg-card px-6 font-semibold shadow-sm"
                onClick={() => {
                  void loadMoreQuestions("button");
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
          variant="outline"
          size="icon"
          data-testid="scroll-to-top-button"
          aria-label="Back to top"
          className={cn(
            "fixed left-4 sm:left-6 z-40 h-11 w-11 rounded-full border-border bg-card/95 text-foreground shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-accent",
            activeTakeoverTopics && activeTakeoverTopics.length > 0 && !takeoverDismissed
              ? "bottom-[calc(var(--bottom-nav-h,0px)+5.25rem)]"
              : "bottom-[calc(var(--bottom-nav-h,0px)+1rem)]"
          )}
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}

      {activeTakeoverTopics && activeTakeoverTopics.length > 0 && !takeoverDismissed && (
        <div
          className="fixed bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-xl backdrop-blur-md animate-in slide-in-from-bottom duration-300"
          style={{
            borderColor: `color-mix(in srgb, ${activeTakeoverTopics[0].color || "#0E7490"} 45%, hsl(var(--border)))`,
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex -space-x-2 shrink-0">
              {activeTakeoverTopics.map((t) => (
                <div
                  key={t._id}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary"
                  title={t.name}
                >
                  <IconComponent
                    icon={(t.icon || "CircleQuestionMark") as Icon}
                    size={18}
                    color={t.color}
                  />
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                <Sparkles className="size-3" aria-hidden="true" />
                Featured Topic
              </p>
              <p className="truncate text-sm font-bold text-foreground">
                {activeTakeoverTopics.map((t) => t.name).join(" & ")} Takeover
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTakeoverDismissed(true)}
            aria-label="Dismiss this banner"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
