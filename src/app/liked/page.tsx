import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useMemo, useState, useEffect } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QuestionList } from "@/components/question-list/QuestionList";
import { FilterControls } from "@/components/filter-controls/filter-controls";
import { useFilter } from "@/hooks/useFilter";

import { cn, isColorDark } from "@/lib/utils";

import { Header } from "@/components/header";
import { toast } from "sonner";


function LikedQuestionsPageContent() {
  const { effectiveTheme } = useTheme();
  const [searchText, setSearchText] = useState("");
  const { likedQuestions, removeLikedQuestion, setLikedQuestions, clearLikedQuestions, addHiddenStyle, addHiddenTone } = useStorageContext();
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  
  // Filter out invalid question IDs to prevent errors
  const validLikedQuestions = useMemo(() => {
    return likedQuestions.filter(id => {
      // Basic validation - check if it's a string and looks like a valid ID
      return typeof id === 'string' && id.length > 0;
    });
  }, [likedQuestions]);
  
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: validLikedQuestions });
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});

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

  const styleColors = useMemo(() => {
    if (!styles) return {};
    return styles.reduce((acc, style) => {
      acc[style.id] = style.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [styles]);

  const toneColors = useMemo(() => {
    if (!tones) return {};
    return tones.reduce((acc, tone) => {
      acc[tone.id] = tone.color;
      return acc;
    }, {} as { [key: string]: string });
  }, [tones]);


  const handleRemoveFavorite = (questionId: Id<"questions">) => {
    if (!questions) return;
    removeLikedQuestion(questionId);
  };

  const handleHideStyle = (styleId: string) => {
    addHiddenStyle(styleId);
    toast.success("Style hidden");
  };

  const handleHideTone = (toneId: string) => {
    addHiddenTone(toneId);
    toast.success("Tone hidden");
  };

  const handleClearLikes = () => {
    setSearchText("");
    toast.success("Likes cleared");
    clearLikedQuestions();
  };

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];
  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradient[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradient[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header
        homeLinkSlot="liked"
        gradient={gradient} />

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
        <div className="container mx-auto flex flex-col gap-4 p-4">
          <div className="container mx-auto flex flex-col gap-4">
            <div className="flex justify-between gap-2 w-full">
              <input
                type="text"
                placeholder="Search questions"
                className="flex-grow pl-2 rounded-md border border-gray-300 dark:border-gray-700"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleClearLikes}
                  className="p-2 rounded-md border bg-gray-500 hover:bg-gray-600 text-white border-gray-300 dark:border-gray-700"
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
          <QuestionList
            questions={filteredQuestions}
            styleColors={styleColors}
            toneColors={toneColors}
            styles={styles || []}
            tones={tones || []}
            likedQuestions={likedQuestions}
            onToggleLike={handleRemoveFavorite}
            onRemoveItem={handleRemoveFavorite}
            onHideStyle={handleHideStyle}
            onHideTone={handleHideTone}
          />
        </div>
      )}
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