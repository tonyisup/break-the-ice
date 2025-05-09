import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Doc } from "../convex/_generated/dataModel";
import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import CardShuffleLoader from "./components/card-shuffle-loader/card-shuffle-loader";
import { QuestionCard } from "./components/question-card/question-card";


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
  const [likedQuestions, setLikedQuestions] = useLocalStorage<string[]>("likedQuestions", []);
  const [startTime, setStartTime] = useState(Date.now());
  const [currentQuestions, setCurrentQuestions] = useState<Doc<"questions">[]>([]);
  const getRandomQuestion = useMutation(api.questions.getRandomQuestions);
  const recordAnalytics = useMutation(api.questions.recordAnalytics);

  // Fetch initial question on mount
  useEffect(() => {
    const fetchInitialQuestion = async () => {
      const questions = await getRandomQuestion({ count: 2 });
      setCurrentQuestions(questions);
    };
    fetchInitialQuestion();
  }, []); // Empty dependency array means this runs once on mount


  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);



  const handleDiscard = async () => {
    if (!currentQuestions) return;
    const viewDuration = Math.min(Date.now() - startTime, 10000);
    await recordAnalytics({
      questionId: currentQuestions[0]._id, 
      event: "discard",
      viewDuration,
    });
    const nextQuestions = await getRandomQuestion({ count: 1 });
    setCurrentQuestions((prev) => [...prev.slice(1), ...nextQuestions]);
  };

  const toggleLike = async () => {
    if (!currentQuestions) return;
    const viewDuration = Math.min(Date.now() - startTime, 10000);
    const isLiked = likedQuestions.includes(currentQuestions[0]._id);

    if (isLiked) {
      // Unlike
      setLikedQuestions(likedQuestions.filter(id => id !== currentQuestions[0]._id));
      toast.success("Removed from favorites");
    } else {
      // Like
      setLikedQuestions([...likedQuestions, currentQuestions[0]._id]);
      await recordAnalytics({
        questionId: currentQuestions[0]._id,
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
    <div className="min-h-screen dark:bg-gray-900 dark:text-white transition-colors">
      {/* <header className="p-4 flex justify-between items-center">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800"
        >
          {theme === "dark" ? "🌞" : "🌙"}
        </button>
      </header> */}
      <main className="p-4 relative">
        {currentQuestions.map((currentQuestion) => (
          <div key={currentQuestion._id} className="absolute top-1/2 translate-y-1/2 left-1/2 -translate-x-1/2">
            <QuestionCard
              currentQuestion={currentQuestion}
              liked={likedQuestions.includes(currentQuestion._id)}
              handleDiscard={handleDiscard}
              toggleLike={toggleLike}
            />
          </div>
        ))}
      </main>
    </div>
  );
}
