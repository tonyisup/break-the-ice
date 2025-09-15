import { useLocalStorage } from "./useLocalStorage";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const MAX_HISTORY_LENGTH = 100;

export type HistoryEntry = {
  question: Doc<"questions">;
  viewedAt: number;
};

export function useQuestionHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>(
    "questionHistory",
    []
  );

  const historyIds = useMemo(
    () => history.map((entry) => entry.question._id),
    [history]
  );
  const questions = useQuery(api.questions.getQuestionsByIds, {
    ids: historyIds,
  });

  useEffect(() => {
    if (questions) {
      const serverIds = new Set(questions.map((q) => q!._id));
      if (serverIds.size !== history.length) {
        const newHistory = history.filter((entry) =>
          serverIds.has(entry.question._id)
        );
        if (newHistory.length !== history.length) {
          setHistory(newHistory);
        }
      }
    }
  }, [questions, history, setHistory]);

  const addQuestionToHistory = useCallback(
    (question: Doc<"questions">) => {
      setHistory((prevHistory) => {
        const newHistory = [
          { question, viewedAt: Date.now() },
          ...prevHistory.filter(
            (entry) => entry.question._id !== question._id
          ),
        ];
        return newHistory.slice(0, MAX_HISTORY_LENGTH);
      });
    },
    [setHistory]
  );

  const removeQuestionFromHistory = useCallback(
    (questionId: Id<"questions">) => {
      setHistory((prevHistory) => {
        return prevHistory.filter(
          (entry) => entry.question._id !== questionId
        );
      });
    },
    [setHistory]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return { history, addQuestionToHistory, removeQuestionFromHistory, clearHistory };
}
