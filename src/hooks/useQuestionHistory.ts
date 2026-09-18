import { useStorageContext } from "./useStorageContext";
import { useCallback } from "react";
import { Doc, Id } from "../../convex/_generated/dataModel";

export type HistoryEntry = {
  question: Doc<"questions">;
  viewedAt: number;
};

export function useQuestionHistory() {
  const { questionHistory } = useStorageContext();

  // These are now no-ops as history is read-only (fed by backend analytics)
  const addQuestionHistoryEntry = useCallback((_question: Doc<"questions">) => {}, []);
  const removeQuestionHistoryEntry = useCallback((_questionId: Id<"questions">) => {}, []);
  const clearHistoryEntries = useCallback(() => {}, []);

  return {
    history: questionHistory,
    addQuestionHistoryEntry,
    removeQuestionHistoryEntry,
    clearHistoryEntries
  };
}
