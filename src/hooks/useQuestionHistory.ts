import { useLocalStorage } from "./useLocalStorage";
import { Doc } from "../../convex/_generated/dataModel";

const MAX_HISTORY_LENGTH = 100;

export function useQuestionHistory() {
  const [history, setHistory] = useLocalStorage<Doc<"questions">[]>("questionHistory", []);

  const addQuestionToHistory = (question: Doc<"questions">) => {
    setHistory((prevHistory) => {
      const newHistory = [question, ...prevHistory.filter(q => q._id !== question._id)];
      return newHistory.slice(0, MAX_HISTORY_LENGTH);
    });
  };

  return { history, addQuestionToHistory };
}
