import { useMemo } from "react";
import { Doc } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";

function isHistoryEntry(item: any): item is HistoryEntry {
  return (item as HistoryEntry).question !== undefined;
}

export const useFilter = (
  items: (Doc<"questions"> | HistoryEntry)[],
  searchText: string,
  selectedStyles: string[],
  selectedTones: string[]
) => {
  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter(
      (item) => {
        const question = isHistoryEntry(item) ? item.question : item;
        if (!question) return false;
        if (!question.text) return false;
        return question.text.toLowerCase().includes(searchText.toLowerCase()) &&
          (selectedStyles.length === 0 || selectedStyles.includes(question.style!)) &&
          (selectedTones.length === 0 || selectedTones.includes(question.tone!))
      }
    );
  }, [items, searchText, selectedStyles, selectedTones]);

  return filteredItems;
};
