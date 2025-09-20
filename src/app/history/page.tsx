import { useQuestionHistory, HistoryEntry } from "../../hooks/useQuestionHistory";
import { useMemo, useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "@/hooks/useTheme";
import { Header } from "@/components/header";
import { useStorageContext } from "@/hooks/useStorageContext";
import { Link } from "react-router-dom";
import { cn, isColorDark } from "@/lib/utils";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QuestionList } from "@/components/question-list/QuestionList";

function HistoryPageContent() {
  const { history, removeQuestionFromHistory, clearHistory } = useQuestionHistory();
  const { likedQuestions, setLikedQuestions } = useStorageContext();
  const [searchText, setSearchText] = useState("");
  const recordAnalytics = useMutation(api.questions.recordAnalytics);
  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});
  const { theme } = useTheme();

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

  const filteredHistory = useMemo(() => {
    return history.filter(entry =>
      entry.question.text.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [history, searchText]);

  const toggleLike = async (questionId: Id<"questions">) => {
    const isLiked = likedQuestions.includes(questionId);

    if (isLiked) {
      setLikedQuestions(likedQuestions.filter(id => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration: 0, // Not applicable in history page
      });
      toast.success("Added to favorites!");
    }
  };

  const handleClearHistory = () => {
    setSearchText("");
    clearHistory();
    toast.success("History cleared");
  };

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradient = ["#3B2554", "#262D54"];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      style={{
        background: `linear-gradient(135deg, ${theme === "dark" ? gradient[0] : gradientLight[0]}, ${theme === "dark" ? gradient[1] : gradientLight[1]}, ${theme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header
        gradient={gradient}
        homeLinkSlot="history" />
      <main className="p-4">
        {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center">
          <p className="text-center text-gray-500 dark:text-gray-400">No questions viewed yet.</p>
          <Link
            to="/"
            className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "inline-block mt-4 font-bold py-2 px-4 rounded-lg backdrop-blur-sm hover:bg-white/30 transition-colors text-white")}
          >
            Start Exploring
          </Link>
        </div>
        ) : (
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
                 onClick={handleClearHistory}
                 className="p-2 rounded-md border bg-gray-500 hover:bg-gray-600 text-white border-gray-300 dark:border-gray-700"
                >
                  Clear history
                </button>
              </div>
            </div>
            <QuestionList
              questions={filteredHistory}
              styleColors={styleColors}
              toneColors={toneColors}
              likedQuestions={likedQuestions}
              onToggleLike={toggleLike}
              onRemoveItem={removeQuestionFromHistory}
              isHistory
            />
          </div>
        )}
      </main>
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
    <ErrorBoundary onReset={handleResetHistory}>
      <HistoryPageContent />
    </ErrorBoundary>
  );
}

