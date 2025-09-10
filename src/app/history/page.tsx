import { useQuestionHistory } from "../../hooks/useQuestionHistory";
import { Link } from "react-router-dom";
import { ModernQuestionCard } from "../../components/modern-question-card";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function HistoryPage() {
  const { history } = useQuestionHistory();
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);

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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="p-4 flex justify-between items-center bg-white dark:bg-gray-800 shadow-md">
        <Link to="/" className="text-lg font-bold">
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold">History</h1>
        <div />
      </header>
      <main className="p-4">
        {history.length === 0 ? (
          <p className="text-center text-gray-500">No questions viewed yet.</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((question) => (
              <ModernQuestionCard
                key={question._id}
                question={question}
                isGenerating={false}
                isFavorite={likedQuestions.includes(question._id)}
                onToggleFavorite={() => toggleLike(question._id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
