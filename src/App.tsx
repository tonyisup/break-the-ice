import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Doc, Id } from "../convex/_generated/dataModel";
import CardShuffleLoader from "./components/card-shuffle-loader/card-shuffle-loader";
import { QuestionCard } from "./components/question-card/question-card";
import { Link } from "react-router-dom";


function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [likedQuestions, setLikedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const discardQuestion = useMutation(api.questions.discardQuestion);
  const currentQuestions = useQuery(api.questions.getNextQuestions, { count: 2 });
  const recordAnalytics = useMutation(api.questions.recordAnalytics);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);



  const handleDiscard = async (questionId: string) => {
    if (!currentQuestions) return;
    discardQuestion({ questionId: questionId as Id<"questions">, startTime });
  };

  const toggleLike = async (questionId: Id<"questions">) => {
    if (!currentQuestions) return;
    const viewDuration = Math.min(Date.now() - startTime, 10000);
    const isLiked = likedQuestions.includes(questionId);

    if (isLiked) {
      // Unlike
      setLikedQuestions(likedQuestions.filter(id => id !== questionId));
      toast.success("Removed from favorites");
    } else {
      // Like
      setLikedQuestions([...likedQuestions, questionId]);
      await recordAnalytics({
        questionId,
        event: "like",
        viewDuration,
      });
      toast.success("Added to favorites!");
    }
  };

  if (!currentQuestions) {
    return (
      <div className="min-h-screen dark:bg-gray-900 dark:text-white flex items-center justify-center">
        <CardShuffleLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-gray-900 dark:text-white transition-colors overflow-hidden">
      <header className="p-4 flex justify-between items-center">
        <Link
          to="/liked"
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          ❤️ Liked Questions
        </Link>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </header>
      <main className="p-4 relative">
        {currentQuestions.sort((a, b) => (b.lastShownAt ?? 0) - (a.lastShownAt ?? 0)).map((currentQuestion) => (
          <div key={currentQuestion._id} className="absolute top-1/2 translate-y-1/2 left-1/2 -translate-x-1/2">
            <QuestionCard
              currentQuestion={currentQuestion}
              liked={likedQuestions.includes(currentQuestion._id)}
              handleDiscard={() => handleDiscard(currentQuestion._id)}
              toggleLike={() => toggleLike(currentQuestion._id)}
            />
          </div>
        ))}
      </main>
    </div>
  );
}
