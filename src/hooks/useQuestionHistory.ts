import { useLocalStorage } from "./useLocalStorage";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useCallback } from "react";

const MAX_HISTORY_LENGTH = 100;

export type HistoryEntry = {
  question: Doc<"questions">;
  viewedAt: number;
};

export function useQuestionHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("questionHistory", []);

  const addQuestionToHistory = useCallback((question: Doc<"questions">) => {
    setHistory((prevHistory) => {
      const newHistory = [{ question, viewedAt: Date.now() }, ...prevHistory.filter(entry => entry.question._id !== question._id)];
      return newHistory.slice(0, MAX_HISTORY_LENGTH);
    });
  }, [setHistory]);

  const removeQuestionFromHistory = useCallback((questionId: Id<"questions">) => {
    setHistory((prevHistory) => {
      return prevHistory.filter(entry => entry.question._id !== questionId);
    });
  }, [setHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return { history, addQuestionToHistory, removeQuestionFromHistory, clearHistory };
}
