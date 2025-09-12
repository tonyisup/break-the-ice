import { useLocalStorage } from "./useLocalStorage";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const MAX_HISTORY_LENGTH = 100;

export function useQuestionHistory() {
  const [history, setHistory] = useLocalStorage<Doc<"questions">[]>("questionHistory", []);
  const historyIds = useMemo(() => history.map(q => q._id), [history]);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: historyIds });

  useEffect(() => {
    if (questions) {
      const serverIds = questions.map(q => q._id);
      const localIds = history.map(q => q._id);
      if (serverIds.length !== localIds.length) {
        const newHistory = history.filter(q => serverIds.includes(q._id));
        setHistory(newHistory);
      }
    }
  }, [questions, history, setHistory]);

  const addQuestionToHistory = useCallback((question: Doc<"questions">) => {
    setHistory((prevHistory) => {
      const newHistory = [question, ...prevHistory.filter(q => q._id !== question._id)];
      return newHistory.slice(0, MAX_HISTORY_LENGTH);
    });
  }, [setHistory]);

  const removeQuestionFromHistory = useCallback((questionId: Id<"questions">) => {
    setHistory((prevHistory) => {
      return prevHistory.filter(q => q._id !== questionId);
    });
  }, [setHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return { history, addQuestionToHistory, removeQuestionFromHistory, clearHistory };
}
