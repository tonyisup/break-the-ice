import { useStorageContext } from "./useStorageContext";
import { useCallback } from "react";
import { Doc, Id } from "../../convex/_generated/dataModel";

export type HistoryEntry = {
  question: Doc<"questions">;
  viewedAt: number;
};

export function useQuestionHistory() {
  const { questionHistory, clearQuestionHistory, questionHistoryLoading } = useStorageContext();
  
  // These are now no-ops as history is read-only (fed by backend analytics)
  const addQuestionHistoryEntry = useCallback((question: Doc<"questions">) => {}, []);
  const removeQuestionHistoryEntry = useCallback((questionId: Id<"questions">) => {}, []);
  // Clears a guest's history on this device, or a signed-in person's history on their account.
  const clearHistoryEntries = clearQuestionHistory;

  return {
    history: questionHistory,
    isLoading: !!questionHistoryLoading,
    addQuestionHistoryEntry,
    removeQuestionHistoryEntry,
    clearHistoryEntries
  };
}
