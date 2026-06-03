import { useMemo } from "react";
import { Doc } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";

function isHistoryEntry(item: any): item is HistoryEntry {
  return (item as HistoryEntry).question !== undefined;
}

export const useFilter = <T extends Doc<"questions"> | HistoryEntry>(
  items: T[],
  searchText: string,
  selectedStyles: string[],
  selectedTones: string[]
): T[] => {
  const filteredItems = useMemo((): T[] => {
    if (!items) return [] as T[];
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
