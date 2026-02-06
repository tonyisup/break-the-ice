import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo, useState, useEffect } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { FilterControls } from "@/components/filter-controls/filter-controls";
import { useFilter } from "@/hooks/useFilter";
import { AddPersonalQuestionDialog } from "@/components/add-personal-question-dialog/AddPersonalQuestionDialog";
import { QuestionGrid } from "@/components/question-grid/QuestionGrid";
import { CollapsibleSection } from "@/components/collapsible-section/CollapsibleSection";

import { cn, isColorDark } from "@/lib/utils";

import { Header } from "@/components/header";
import { toast } from "sonner";
import { SignInCTA } from "@/components/SignInCTA";
import { Button } from "@/components/ui/button";
import { useAuth, useClerk } from "@clerk/clerk-react";

function LikedQuestionsPageContent() {
  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { effectiveTheme } = useTheme();
  const [searchText, setSearchText] = useState("");
  const { likedQuestions, addLikedQuestion, removeLikedQuestion, setLikedQuestions, clearLikedQuestions, hiddenQuestions, addHiddenQuestion, removeHiddenQuestion, addHiddenStyle, addHiddenTone } = useStorageContext();
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [isAddPersonalQuestionDialogOpen, setIsAddPersonalQuestionDialogOpen] = useState(false);

  const [isPersonalOpen, setIsPersonalOpen] = useState(true);
  const [isLikedOpen, setIsLikedOpen] = useState(true);

  // Filter out invalid question IDs to prevent errors
  const myQuestions = useQuery(api.core.questions.getCustomQuestions, {});


  const validLikedQuestions = useMemo(() => {
    const combined = [...likedQuestions];
    const uniqueIds = Array.from(new Set(combined));
    return uniqueIds.filter(id => {
      return typeof id === 'string' && id.length > 0;
    });
  }, [likedQuestions]);

  const questions = useQuery(api.core.questions.getQuestionsByIds, { ids: validLikedQuestions as Id<"questions">[] });
  const styles = useQuery(api.core.styles.getStyles, {});
  const tones = useQuery(api.core.tones.getTones, {});

  const filteredQuestions = useFilter(questions || [], searchText, selectedStyles, selectedTones);

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
        clearLikedQuestions();
        // Reset cleanup flag after a short delay
        setTimeout(() => setIsCleaningUp(false), 100);
      }
    } catch (error) {
      console.error("Error cleaning up invalid question IDs:", error);
      setIsCleaningUp(false);
    }
  }, [likedQuestions, clearLikedQuestions, isCleaningUp]);

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
          toast.success("Cleaned up deleted questions from your favorites");
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
      toast.success("Removed from favorites");
    } else {
      // If it was hidden, remove it from hidden
      if (hiddenQuestions.includes(questionId)) {
        removeHiddenQuestion(questionId);
      }
      addLikedQuestion(questionId);
      toast.success("Added to favorites!");
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
        toast.success("Question hidden");
      }
    } catch (error) {
      console.error("Error toggling hide:", error);
      toast.error("Failed to hide question.");
    }
  };

  const handleClearLikes = () => {
    setSearchText("");
    toast.success("Likes cleared");
    clearLikedQuestions();
  };

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];
  const currentGradient: [string, string] = effectiveTheme === "dark" ? ["#3B2554", "#262D54"] : ["#667EEA", "#A064DE"];

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradient[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradient[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header homeLinkSlot="liked" />

      <AddPersonalQuestionDialog
        isOpen={isAddPersonalQuestionDialogOpen}
        onOpenChange={setIsAddPersonalQuestionDialogOpen}
      />

      <div className="container mx-auto p-4 pt-24 space-y-8">
        {/* Personal Questions Section */}
        <div>
          <div className="flex justify-center items-center mb-4">
            {isSignedIn ? (
              <Button onClick={() => setIsAddPersonalQuestionDialogOpen(true)}>Add Question</Button>
            ) : (
              <SignInCTA
                bgGradient={currentGradient}
                title={likedQuestions.length >= (Number(import.meta.env.VITE_MAX_ANON_LIKED) || 20) ? "Liked limit reached" : "Want more features?"}
                featureHighlight={{
                  pre: "Sign in to",
                  highlight: "add your own questions",
                  post: "and remove the limit on likes",
                }}
              />
            )}
          </div>

          {myQuestions && myQuestions.length > 0 && (
            <CollapsibleSection
              title="My Submitted Questions"
              count={myQuestions.length}
              isOpen={isPersonalOpen}
              onOpenChange={setIsPersonalOpen}
            >
              <QuestionGrid
                questions={myQuestions as Doc<"questions">[]}
                styles={styles || []}
                tones={tones || []}
                likedQuestions={likedQuestions}
                hiddenQuestions={hiddenQuestions}
                onToggleLike={handleToggleLike}
                onRemoveItem={toggleHide}
                variant="condensed"
              />
            </CollapsibleSection>
          )}
        </div>

        {/* Liked Questions Section */}
        {questions && questions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">You haven't liked any questions yet.</p>
            <Link
              to="/"
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "inline-block mt-4 font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
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
                  className="flex-grow pl-2 rounded-md border border-gray-300 dark:border-gray-700 h-10"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleClearLikes}
                    className="px-4 rounded-md border bg-gray-500 hover:bg-gray-600 text-white border-gray-300 dark:border-gray-700"
                  >
                    Clear likes
                  </button>
                </div>
              </div>
            </div>
            <FilterControls
              questions={questions || []}
              styles={styles || []}
              tones={tones || []}
              selectedStyles={selectedStyles}
              onSelectedStylesChange={setSelectedStyles}
              selectedTones={selectedTones}
              onSelectedTonesChange={setSelectedTones}
            />

            <CollapsibleSection
              title="Liked Questions"
              count={filteredQuestions.length}
              isOpen={isLikedOpen}
              onOpenChange={setIsLikedOpen}
            >
              <QuestionGrid
                questions={filteredQuestions as Doc<"questions">[]}
                styles={styles || []}
                tones={tones || []}
                likedQuestions={likedQuestions}
                hiddenQuestions={hiddenQuestions}
                onToggleLike={handleToggleLike}
                onRemoveItem={toggleHide}
                variant="condensed"
              />
            </CollapsibleSection>
          </div>
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
    <ErrorBoundary onReset={handleResetLikes}>
      <LikedQuestionsPageContent />
    </ErrorBoundary>
  );
}
