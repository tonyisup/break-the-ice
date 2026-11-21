import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo, useState, useEffect } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useHideTaxonomy } from "../../hooks/useHideTaxonomy";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { FeedFilterBar, useFilterBarState } from "@/components/filter-controls/FeedFilterBar";
import { useFilter } from "@/hooks/useFilter";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";

import { cn } from "@/lib/utils";

import { Header } from "@/components/header";
import { toast } from "sonner";
import { SignInCTA } from "@/components/SignInCTA";
import { useAuth, useClerk } from "@clerk/clerk-react";

function LikedQuestionsPageContent() {
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { effectiveTheme } = useTheme();
  const { hideStyle, hideTone } = useHideTaxonomy();
  const [searchText, setSearchText] = useState("");
  const { likedQuestions, likedLimit, addLikedQuestion, removeLikedQuestion, setLikedQuestions, clearLikedQuestions, hiddenQuestions, addHiddenQuestion, removeHiddenQuestion, addHiddenStyle, addHiddenTone, savedListsLoading } = useStorageContext();
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const [isLikedOpen, setIsLikedOpen] = useState(true);



  const validLikedQuestions = useMemo(() => {
    const combined = [...likedQuestions];
    const uniqueIds = Array.from(new Set(combined));
    return uniqueIds.filter(id => {
      return typeof id === 'string' && id.length > 0;
    });
  }, [likedQuestions]);

  const questions = useQuery(api.core.questions.getQuestionsByIds, { ids: validLikedQuestions });
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});

  const topics = useQuery(api.core.topics.getTopics, {});
  const filterBar = useFilterBarState(styles, tones, topics);
  const filteredQuestions = useFilter<Doc<"questions">>(questions ?? [], searchText, filterBar.choice);

  // Build style/tone lookup maps for card rendering
  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    if (!styles) return map;
    styles.forEach(s => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [styles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    if (!tones) return map;
    tones.forEach(t => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [tones]);

  // Clean up invalid question IDs automatically
  useEffect(() => {
    if (isCleaningUp) return;

    try {
      const validQuestions = likedQuestions.filter(id => {
        return typeof id === 'string' && id.length > 0;
      });

      if (validQuestions.length !== likedQuestions.length) {
        console.log("Cleaning up invalid question IDs from localStorage");
        setIsCleaningUp(true);
        // Drop only the bad entries; the rest of the list is kept.
        setLikedQuestions(validQuestions);
        // Reset cleanup flag after a short delay
        setTimeout(() => setIsCleaningUp(false), 100);
      }
    } catch (error) {
      console.error("Error cleaning up invalid question IDs:", error);
      setIsCleaningUp(false);
    }
  }, [likedQuestions, setLikedQuestions, isCleaningUp]);

  // Remove questions that no longer exist in the database
  useEffect(() => {
    if (isCleaningUp) return;

    try {
      if (questions && likedQuestions.length > 0) {
        const existingQuestionIds = new Set(questions.map(q => q._id));
        const validIds = likedQuestions.filter(id => existingQuestionIds.has(id));

        if (validIds.length !== likedQuestions.length) {
          console.log("Removing deleted questions from likes");
          setIsCleaningUp(true);
          setLikedQuestions(validIds);
          toast.success("Removed deleted questions from Liked");
          // Reset cleanup flag after a short delay
          setTimeout(() => setIsCleaningUp(false), 100);
        }
      }
    } catch (error) {
      console.error("Error cleaning up deleted questions:", error);
      setIsCleaningUp(false);
    }
  }, [questions, likedQuestions, setLikedQuestions, isCleaningUp]);

  // Cleanup effect to prevent memory leaks
  useEffect(() => {
    return () => {
      // Cleanup any pending timeouts
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
      // If it was hidden, remove it from hidden
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
        // If it was liked, remove it from favorites
        const wasLiked = likedQuestions.includes(questionId);
        if (wasLiked) {
          removeLikedQuestion(questionId);
        }
        addHiddenQuestion(questionId);
        toast.success(wasLiked ? "Question hidden and removed from Liked" : "Question hidden", {
          action: {
            label: "Undo",
            onClick: () => {
              removeHiddenQuestion(questionId);
              if (wasLiked) addLikedQuestion(questionId);
            },
          },
        });
      }
    } catch (error) {
      console.error("Error hiding question:", error);
      toast.error("Failed to hide question.");
    }
  };

  const handleClearLikes = () => {
    if (!window.confirm(`Remove all ${likedQuestions.length} liked questions? This can't be undone.`)) return;
    setSearchText("");
    toast.success("Likes cleared");
    clearLikedQuestions();
  };

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];
  const currentGradient: [string, string] = effectiveTheme === "dark" ? ["#3B2554", "#262D54"] : ["#667EEA", "#A064DE"];

  const renderCard = (question: Doc<"questions">) => {
    const style = stylesMap.get(question.styleId || (question.style as string) || "");
    const tone = tonesMap.get(question.toneId || (question.tone as string) || "");
    const styleColor = style?.color || "#667EEA";
    const toneColor = tone?.color || "#764BA2";
    const cardGradient = [styleColor, toneColor];

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

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradient[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradient[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header />

      <div className="container mx-auto p-4 pt-[calc(var(--header-h,4rem)+1.5rem)] space-y-8">
        <h1 className="text-2xl font-bold text-white">Liked questions</h1>
        {!isSignedIn && likedQuestions.length >= likedLimit && (
          <div className="flex justify-center items-center">
            <SignInCTA
              bgGradient={currentGradient}
              title="Liked limit reached"
              featureHighlight={{
                pre: "Sign in to",
                highlight: "remove the limit on likes",
                post: "and add your own questions",
              }}
            />
          </div>
        )}

        {/* Liked Questions Section */}
        {questions === undefined || savedListsLoading ? (
          <div className="flex justify-center py-12" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" aria-hidden="true"></div>
            <span className="sr-only">Loading liked questions…</span>
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12">
            <p className="inline-block rounded-xl bg-black/50 px-4 py-2 text-white text-lg">You haven't liked any questions yet.</p><br />
            <Link
              to="/app"
              className={cn("bg-black/50", "inline-flex min-h-11 items-center mt-4 font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-black/60 transition-colors text-white")}
            >
              Start Exploring
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between gap-2 w-full">
                <input
                  type="text"
                  placeholder="Search questions"
                  aria-label="Search liked questions"
                  className="flex-grow min-w-0 h-11 px-3 rounded-md border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClearLikes}
                    className="min-h-11 px-4 rounded-md border bg-gray-500 hover:bg-gray-600 text-white border-gray-300 dark:border-gray-700"
                  >
                    Clear likes
                  </button>
                </div>
              </div>
            </div>
            {/* The same Style, Tone and Topic bar as the feed. */}
            <FeedFilterBar {...filterBar.barProps} sticky={false} />

            <CollapsibleSection
              title="Liked Questions"
              count={Number.isFinite(likedLimit) ? `${likedQuestions.length}/${likedLimit}` : likedQuestions.length}
              isOpen={isLikedOpen}
              onOpenChange={setIsLikedOpen}
            >
              {filteredQuestions.length === 0 && (
                <div className="py-6 text-center">
                  <p className="dark:text-white text-black">No liked questions match your search or filters.</p>
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded-md bg-white/30 px-4 font-semibold dark:text-white text-black hover:bg-white/40"
                    onClick={() => { setSearchText(""); filterBar.clear(); }}
                  >
                    Clear search and filters
                  </button>
                </div>
              )}
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredQuestions.map((question) => (
                  <div key={question._id}>
                    {renderCard(question)}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        )}
        {!isSignedIn && likedQuestions.length < likedLimit && (
          <p className="mx-auto w-fit rounded-xl bg-black/50 px-4 py-2 text-center text-sm text-white">
            Likes are saved on this device.{" "}
            <button type="button" onClick={() => openSignIn()} className="min-h-11 font-semibold underline underline-offset-4">
              Sign in
            </button>{" "}
            to keep them everywhere and add your own questions.
          </p>
        )}
      </div>
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
