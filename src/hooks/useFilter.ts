import { useMemo } from "react";
import { Doc } from "../../convex/_generated/dataModel";

export const useFilter = (
  questions: Doc<"questions">[],
  searchText: string,
  selectedStyles: string[],
  selectedTones: string[]
) => {
  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    return questions.filter(
      (question) =>
        question.text.toLowerCase().includes(searchText.toLowerCase()) &&
        (selectedStyles.length === 0 || selectedStyles.includes(question.style!)) &&
        (selectedTones.length === 0 || selectedTones.includes(question.tone!))
    );
  }, [questions, searchText, selectedStyles, selectedTones]);

  return filteredQuestions;
};
