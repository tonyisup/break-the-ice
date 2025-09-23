import { useStorageContext } from "./useStorageContext";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

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
  const { questionHistory, setQuestionHistory, addQuestionToHistory, removeQuestionFromHistory, clearQuestionHistory } = useStorageContext();
  const historyIds = useMemo(() => questionHistory.filter(entry => entry.question).map(entry => entry.question._id), [questionHistory]);
  const questions = useQuery(api.questions.getQuestionsByIds, { ids: historyIds });
  // Filter out invalid questions
  const history = useMemo(() => {
    const validQuestions = questionHistory.filter(isValidQuestion);
    if (validQuestions.length !== questionHistory.length) {
      console.log("Cleaning up invalid questions from history");
      setQuestionHistory(validQuestions);
    }
    return validQuestions;
  }, [questionHistory, setQuestionHistory]);
  
  useEffect(() => {
    if (questions) {
      const serverIds = questions.map(q => q._id);
      const localIds = history.filter(entry => entry.question).map(entry => entry.question._id);
      if (serverIds.length !== localIds.length) {
        const newRawHistory = questionHistory.filter(entry => entry.question && serverIds.includes(entry.question._id));
        setQuestionHistory(newRawHistory);
      }
    }
  }, [questions, history, questionHistory, setQuestionHistory]);

  const addQuestionHistoryEntry = useCallback((question: Doc<"questions">) => {
    addQuestionToHistory({ question, viewedAt: Date.now() });
  }, [addQuestionToHistory]);
    
  const removeQuestionHistoryEntry = useCallback((questionId: Id<"questions">) => {
    removeQuestionFromHistory(questionId);
  }, [removeQuestionFromHistory]);
    
  const clearHistoryEntries = useCallback(() => {
    clearQuestionHistory();
  }, [clearQuestionHistory]);

  return { history, addQuestionHistoryEntry, removeQuestionHistoryEntry, clearHistoryEntries };
}
