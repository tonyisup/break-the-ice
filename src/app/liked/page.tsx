import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import CardShuffleLoader from "../../components/card-shuffle-loader/card-shuffle-loader";
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

  return [storedValue] as const;
}

export default function LikedQuestionsPage() {
  const [likedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: likedQuestions });

  if (!questions) {
    return (
      <div className="min-h-screen dark:bg-gray-900 dark:text-white flex items-center justify-center">
        <CardShuffleLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen dark:bg-gray-900 dark:text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            &lt;- Home
          </Link>
          <h1 className="flex-1 text-center text-3xl font-bold">Your Liked Questions</h1>
        </div>
        {questions.length === 0 ? (
          <p className="text-center text-gray-500">You haven't liked any questions yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 lg:grid-cols-4 gap-6">
            {questions.map((question: Doc<"questions">) => (
              <div
                key={question._id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 aspect-[2.5/3.5] flex flex-col justify-between"
              >
                <div className="text-xl text-center my-auto px-2">
                  {question.text}
                </div>
                <div className="text-right text-gray-500 dark:text-gray-400">
                  ❤️
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 