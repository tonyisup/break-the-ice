import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import CardShuffleLoader from "../../components/card-shuffle-loader/card-shuffle-loader";
import { Link } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ErrorBoundary } from "../../components/ErrorBoundary";

function LikedQuestionsPageContent() {
  const { theme, setTheme } = useTheme();
  const [likedQuestions] = useLocalStorage<Id<"questions">[]>("likedQuestions", []);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: likedQuestions });

  if (!questions) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white flex items-center justify-center">
        <CardShuffleLoader />
      </div>
    );
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white p-4 sm:p-8 transition-colors">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <Link to="/" className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            &lt;- Home
          </Link>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "🌞" : "🌙"}
          </button>
        </div>
        {questions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">You haven't liked any questions yet.</p>
            <Link 
              to="/" 
              className="inline-block mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Start Exploring
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {questions.map((question: Doc<"questions">) => (
              <div
                key={question._id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 aspect-[2.5/3.5] flex flex-col justify-between transition-colors hover:shadow-xl"
              >
                <div className="text-center my-auto px-2 text-sm sm:text-base leading-relaxed">
                  {question.text}
                </div>
                <div className="text-right text-gray-500 dark:text-gray-400 text-lg">
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

export default function LikedQuestionsPage() {
  return (
    <ErrorBoundary>
      <LikedQuestionsPageContent />
    </ErrorBoundary>
  );
} 