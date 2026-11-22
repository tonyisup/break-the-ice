import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo, useState, useEffect } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useHideTaxonomy } from "../../hooks/useHideTaxonomy";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import {
  ActiveFilterChips,
  FeedFilterBar,
  useFilterBarState,
} from "@/components/filter-controls/FeedFilterBar";
import { useFilter } from "@/hooks/useFilter";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { SignInCTA } from "@/components/SignInCTA";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { Search, Trash2 } from "lucide-react";

function LikedQuestionsPageContent() {
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  useTheme();
  const { hideStyle, hideTone } = useHideTaxonomy();
  const [searchText, setSearchText] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const {
    likedQuestions,
    likedLimit,
    addLikedQuestion,
    removeLikedQuestion,
    setLikedQuestions,
    clearLikedQuestions,
    hiddenQuestions,
    addHiddenQuestion,
    removeHiddenQuestion,
    savedListsLoading,
  } = useStorageContext();
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const validLikedQuestions = useMemo(() => {
    const combined = [...likedQuestions];
    const uniqueIds = Array.from(new Set(combined));
    return uniqueIds.filter((id) => typeof id === "string" && id.length > 0);
  }, [likedQuestions]);

  const questions = useQuery(api.core.questions.getQuestionsByIds, {
    ids: validLikedQuestions,
  });
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  const topics = useQuery(api.core.topics.getTopics, {});
  const filterBar = useFilterBarState(styles, tones, topics);
  const filteredQuestions = useFilter<Doc<"questions">>(
    questions ?? [],
    searchText,
    filterBar.choice,
  );

  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    if (!styles) return map;
    styles.forEach((s) => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [styles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    if (!tones) return map;
    tones.forEach((t) => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [tones]);

  useEffect(() => {
    if (isCleaningUp) return;

    try {
      const validQuestions = likedQuestions.filter(
        (id) => typeof id === "string" && id.length > 0,
      );

      if (validQuestions.length !== likedQuestions.length) {
        setIsCleaningUp(true);
        setLikedQuestions(validQuestions);
        setTimeout(() => setIsCleaningUp(false), 100);
      }
    } catch (error) {
      console.error("Error cleaning up invalid question IDs:", error);
      setIsCleaningUp(false);
    }
  }, [likedQuestions, setLikedQuestions, isCleaningUp]);

  useEffect(() => {
    if (isCleaningUp) return;

    try {
      if (questions && likedQuestions.length > 0) {
        const existingQuestionIds = new Set(questions.map((q) => q._id));
        const validIds = likedQuestions.filter((id) =>
          existingQuestionIds.has(id),
        );

        if (validIds.length !== likedQuestions.length) {
          setIsCleaningUp(true);
          setLikedQuestions(validIds);
          toast.success("Removed deleted questions from Liked");
          setTimeout(() => setIsCleaningUp(false), 100);
        }
      }
    } catch (error) {
      console.error("Error cleaning up deleted questions:", error);
      setIsCleaningUp(false);
    }
  }, [questions, likedQuestions, setLikedQuestions, isCleaningUp]);

  useEffect(() => {
    return () => {
      setIsCleaningUp(false);
    };
  }, []);

  const handleToggleLike = (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);
    if (isLiked) {
      removeLikedQuestion(questionId);
      toast.success("Removed from Liked", {
        action: { label: "Undo", onClick: () => addLikedQuestion(questionId) },
      });
    } else {
      if (hiddenQuestions.includes(questionId)) {
        removeHiddenQuestion(questionId);
      }
      addLikedQuestion(questionId);
      toast.success("Added to Liked");
    }
  };

  const toggleHide = (questionId: Id<"questions">) => {
    try {
      const isHidden = hiddenQuestions.includes(questionId);
      if (isHidden) {
        removeHiddenQuestion(questionId);
        toast.success("Question unhidden");
      } else {
        const wasLiked = likedQuestions.includes(questionId);
        if (wasLiked) {
          removeLikedQuestion(questionId);
        }
        addHiddenQuestion(questionId);
        toast.success(
          wasLiked ? "Question hidden and removed from Liked" : "Question hidden",
          {
            action: {
              label: "Undo",
              onClick: () => {
                removeHiddenQuestion(questionId);
                if (wasLiked) addLikedQuestion(questionId);
              },
            },
          },
        );
      }
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  };

  const confirmClearLikes = () => {
    setSearchText("");
    toast.success("Likes cleared");
    clearLikedQuestions();
  };

  const renderCard = (question: Doc<"questions">) => {
    const style = stylesMap.get(
      question.styleId || (question.style as string) || "",
    );
    const tone = tonesMap.get(
      question.toneId || (question.tone as string) || "",
    );
    const cardGradient = [style?.color || "#0E7490", tone?.color || "#6366F1"];

    return (
      <div className="relative h-full">
        <ModernQuestionCard
          question={question}
          isGenerating={false}
          isFavorite={likedQuestions.includes(question._id)}
          isHidden={hiddenQuestions.includes(question._id)}
          gradient={cardGradient}
          style={style}
          tone={tone}
          onToggleFavorite={() => handleToggleLike(question._id)}
          onToggleHidden={() => toggleHide(question._id)}
          onHideStyle={hideStyle}
          onHideTone={hideTone}
        />
      </div>
    );
  };

  const countLabel = Number.isFinite(likedLimit)
    ? `${likedQuestions.length}/${likedLimit}`
    : `${likedQuestions.length}`;

  return (
    <div className="deck-canvas min-h-screen text-foreground">
      <Header />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-[calc(var(--header-h,4rem)+1.75rem)] sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
              Liked questions
            </h1>
            {questions && questions.length > 0 && (
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                {countLabel}
              </span>
            )}
          </div>
          {questions && questions.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmClearOpen(true)}
              className="min-h-10 rounded-full border-border bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Clear likes
            </Button>
          )}
        </div>

        {!isSignedIn && likedQuestions.length >= likedLimit && (
          <div className="flex items-center justify-center">
            <SignInCTA
              title="Liked limit reached"
              featureHighlight={{
                pre: "Sign in to",
                highlight: "remove the limit on likes",
                post: "and add your own questions",
              }}
            />
          </div>
        )}

        {questions === undefined || savedListsLoading ? (
          <div className="flex justify-center py-12" role="status">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
              aria-hidden="true"
            />
            <span className="sr-only">Loading liked questions…</span>
          </div>
        ) : questions.length === 0 ? (
          <div className="deck-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
            <p className="text-base font-medium text-muted-foreground">
              You haven't liked any questions yet.
            </p>
            <Button asChild className="min-h-11 rounded-full px-6 font-semibold">
              <Link to="/app">Start Exploring</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Compact search + collapsible Filter button in one row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search liked questions…"
                  aria-label="Search liked questions"
                  className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              <FeedFilterBar {...filterBar.barProps} hideActiveChips />
            </div>

            <ActiveFilterChips {...filterBar.barProps} className="justify-start" />

            {filteredQuestions.length === 0 ? (
              <div className="deck-card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  No liked questions match your search or filters.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full"
                  onClick={() => {
                    setSearchText("");
                    filterBar.clear();
                  }}
                >
                  Clear search and filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredQuestions.map((question) => (
                  <div key={question._id}>{renderCard(question)}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isSignedIn && likedQuestions.length < likedLimit && (
          <p className="mx-auto w-fit rounded-2xl border border-border bg-card px-4 py-2.5 text-center text-sm text-muted-foreground shadow-sm">
            Likes are saved on this device.{" "}
            <button
              type="button"
              onClick={() => openSignIn()}
              className="font-semibold text-primary underline underline-offset-4"
            >
              Sign in
            </button>{" "}
            to keep them everywhere and add your own questions.
          </p>
        )}
      </main>

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear all liked questions?"
        description={`This will remove all ${likedQuestions.length} liked questions. This can't be undone.`}
        confirmLabel="Clear likes"
        onConfirm={confirmClearLikes}
      />
    </div>
  );
}

export default function LikedQuestionsPage() {
  const { setLikedQuestions } = useStorageContext();
  const handleResetLikes = () => {
    setLikedQuestions([]);
    window.location.reload();
  };

  return (
    <ErrorBoundary onReset={handleResetLikes} resetLabel="Reset Likes & Continue">
      <LikedQuestionsPageContent />
    </ErrorBoundary>
  );
}
