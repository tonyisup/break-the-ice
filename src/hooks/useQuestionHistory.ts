import { useLocalStorage } from "./useLocalStorage";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useCallback, useMemo } from "react";

const MAX_HISTORY_LENGTH = 100;

// Helper function to validate question data
const isValidQuestion = (question: any): question is Doc<"questions"> => {
  return (
    question &&
    typeof question === 'object' &&
    typeof question._id === 'string' &&
    typeof question.text === 'string' &&
    question.text.length > 0
  );
};

export function useQuestionHistory() {
  const [rawHistory, setRawHistory] = useLocalStorage<Doc<"questions">[]>("questionHistory", []);
  
  // Filter out invalid questions
  const history = useMemo(() => {
    const validQuestions = rawHistory.filter(isValidQuestion);
    if (validQuestions.length !== rawHistory.length) {
      console.log("Cleaning up invalid questions from history");
      setRawHistory(validQuestions);
    }
    return validQuestions;
  }, [rawHistory, setRawHistory]);

  const addQuestionToHistory = useCallback((question: Doc<"questions">) => {
    setRawHistory((prevHistory) => {
      const newHistory = [question, ...prevHistory.filter(q => q._id !== question._id)];
      return newHistory.slice(0, MAX_HISTORY_LENGTH);
    });
  }, [setRawHistory]);

  const removeQuestionFromHistory = useCallback((questionId: Id<"questions">) => {
    setRawHistory((prevHistory) => {
      return prevHistory.filter(q => q._id !== questionId);
    });
  }, [setRawHistory]);

  const clearHistory = useCallback(() => {
    setRawHistory([]);
  }, [setRawHistory]);

  return { history, addQuestionToHistory, removeQuestionFromHistory, clearHistory };
}
