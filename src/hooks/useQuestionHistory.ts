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

// Helper function to validate question data
const isValidQuestion = (questionEntry: any): questionEntry is HistoryEntry => {
  const question = questionEntry.question;
  
  return (
    question &&
    typeof question === 'object' &&
    typeof question._id === 'string' &&
    typeof question.text === 'string' &&
    question.text.length > 0
  );
};

export function useQuestionHistory() {
  const [rawHistory, setRawHistory] = useLocalStorage<HistoryEntry[]>("questionHistory", []);
  const historyIds = useMemo(() => rawHistory.filter(entry => entry.question).map(entry => entry.question._id), [rawHistory]);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: historyIds });
  // Filter out invalid questions
  const history = useMemo(() => {
    const validQuestions = rawHistory.filter(isValidQuestion);
    if (validQuestions.length !== rawHistory.length) {
      console.log("Cleaning up invalid questions from history");
      setRawHistory(validQuestions);
    }
    return validQuestions;
  }, [rawHistory, setRawHistory]);
  
  useEffect(() => {
    if (questions) {
      const serverIds = questions.map(q => q._id);
      const localIds = history.filter(entry => entry.question).map(entry => entry.question._id);
      if (serverIds.length !== localIds.length) {
        const newRawHistory = rawHistory.filter(entry => entry.question && serverIds.includes(entry.question._id));
        setRawHistory(newRawHistory);
      }
    }
  }, [questions, rawHistory, setRawHistory]);

  const addQuestionToHistory = useCallback((question: Doc<"questions">) => {
    setRawHistory((prevHistory) => {
      const newHistory = [{ question, viewedAt: Date.now() }, ...prevHistory.filter(entry => entry.question && entry.question._id !== question._id)];
      return newHistory.slice(0, MAX_HISTORY_LENGTH);
    });
  }, [setRawHistory]);
    
  const removeQuestionFromHistory = useCallback((questionId: Id<"questions">) => {
    setRawHistory((prevHistory) => {
      return prevHistory.filter(entry => entry.question && entry.question._id !== questionId);
    });
  }, [setRawHistory]);
    
  const clearHistory = useCallback(() => {
    setRawHistory([]);
  }, [setRawHistory]);

  return { history, addQuestionToHistory, removeQuestionFromHistory, clearHistory };
}
