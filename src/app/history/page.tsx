import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { useMemo, useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "@/hooks/useTheme";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStorageContext } from "@/hooks/useStorageContext";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QuestionList } from "@/components/question-list/QuestionList";
import {
  ActiveFilterChips,
  FeedFilterBar,
  useFilterBarState,
} from "@/components/filter-controls/FeedFilterBar";
import { useFilter } from "@/hooks/useFilter";
import { useHideTaxonomy } from "@/hooks/useHideTaxonomy";
import { SignInCTA } from "@/components/SignInCTA";
import { useAuth } from "@clerk/clerk-react";
import { Search, Trash2 } from "lucide-react";

function HistoryPageContent() {
  const { isSignedIn } = useAuth();
  const {
    history,
    clearHistoryEntries,
    isLoading: isHistoryLoading,
  } = useQuestionHistory();
  const {
    likedQuestions,
    addLikedQuestion,
    removeLikedQuestion,
    hiddenQuestions,
    addHiddenQuestion,
    removeHiddenQuestion,
    sessionId,
  } = useStorageContext();
  const [searchText, setSearchText] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const recordAnalytics = useMutation(api.core.questions.recordAnalytics);
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});
  useTheme();

  const MAX_ANON_HISTORY = Number(import.meta.env.VITE_MAX_ANON_HISTORY) || 100;
  const showLimitCTA = !isSignedIn && history.length >= MAX_ANON_HISTORY;

  const topics = useQuery(api.core.topics.getTopics, {});
  const filterBar = useFilterBarState(styles, tones, topics);
  const filteredHistory = useFilter(history, searchText, filterBar.choice);

  const styleColors = useMemo(() => {
    if (!styles) return {};
    return styles.reduce(
      (acc, style) => {
        acc[style.id] = style.color;
        return acc;
      },
      {} as { [key: string]: string },
    );
  }, [styles]);

  const toneColors = useMemo(() => {
    if (!tones) return {};
    return tones.reduce(
      (acc, tone) => {
        acc[tone.id] = tone.color;
        return acc;
      },
      {} as { [key: string]: string },
    );
  }, [tones]);

  const toggleLike = async (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);

    if (isLiked) {
      removeLikedQuestion(questionId);
      toast.success("Removed from Liked");
    } else {
      addLikedQuestion(questionId);
      void recordAnalytics({
        questionId,
        event: "liked",
        viewDuration: 0,
        sessionId: sessionId || undefined,
      }).catch((error) => console.error("Error recording like:", error));
      toast.success("Added to Liked");
    }
  };
  const handleToggleLike = (questionId: Id<"questions">) => {
    void toggleLike(questionId);
  };

  const { hideStyle: handleHideStyle, hideTone: handleHideTone } =
    useHideTaxonomy();

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
        void recordAnalytics({
          questionId,
          event: "hidden",
          viewDuration: 0,
        });
        toast.success(
          wasLiked
            ? "Question hidden and removed from Liked"
            : "Question hidden",
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
      console.error("Error toggling hide:", error);
      toast.error("Failed to hide question.");
    }
  };

  const confirmClearHistory = () => {
    setSearchText("");
    clearHistoryEntries();
    toast.success("History cleared");
  };

  const where = isSignedIn
    ? "your account's history"
    : "your history on this device";

  return (
    <div className="deck-canvas min-h-screen text-foreground">
      <Header />
      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-[calc(var(--header-h,4rem)+1.75rem)] sm:px-6">
        {isHistoryLoading ? (
          <div className="flex flex-col items-center gap-3 py-12" role="status">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-muted-foreground">
              Loading your history…
            </span>
          </div>
        ) : history.length === 0 ? (
          <div className="space-y-6">
            <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
              History
            </h1>
            <div className="deck-card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-12 text-center">
              <p className="text-base font-medium text-muted-foreground">
                No questions viewed yet.
              </p>
              <Button asChild className="min-h-11 rounded-full px-6 font-semibold">
                <Link to="/app">Start Exploring</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
                  History
                </h1>
                {!isSignedIn && (
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {history.length} of {MAX_ANON_HISTORY}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmClearOpen(true)}
                className="min-h-10 rounded-full border-border bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Clear history
              </Button>
            </div>

            {showLimitCTA && (
              <SignInCTA
                title="History Limit Reached"
                featureHighlight={{
                  pre: "You've used",
                  highlight: `${history.length}/${MAX_ANON_HISTORY}`,
                  post: "guest history slots. Sign in to view unlimited history and save your progress.",
                }}
              />
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search your history…"
                  aria-label="Search your history"
                  className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              <FeedFilterBar {...filterBar.barProps} hideActiveChips />
            </div>

            <ActiveFilterChips {...filterBar.barProps} className="justify-start" />

            {filteredHistory.length === 0 && (
              <div className="deck-card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Nothing in your history matches your search or filters.
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
            )}

            <div className="space-y-5">
              <QuestionList
                questions={filteredHistory}
                styleColors={styleColors}
                toneColors={toneColors}
                styles={styles || []}
                tones={tones || []}
                likedQuestions={likedQuestions}
                hiddenQuestions={hiddenQuestions}
                onToggleLike={handleToggleLike}
                onRemoveItem={toggleHide}
                isHistory
                onHideStyle={handleHideStyle}
                onHideTone={handleHideTone}
              />
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear history?"
        description={`This will clear ${where}. This can't be undone.`}
        confirmLabel="Clear history"
        onConfirm={confirmClearHistory}
      />
    </div>
  );
}

export default function HistoryPage() {
  const { setQuestionHistory } = useStorageContext();
  const handleResetHistory = () => {
    setQuestionHistory([]);
    window.location.reload();
  };

  return (
    <ErrorBoundary
      onReset={handleResetHistory}
      resetLabel="Reset History & Continue"
    >
      <HistoryPageContent />
    </ErrorBoundary>
  );
}
