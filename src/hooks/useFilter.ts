import { useMemo } from "react";
import { Doc } from "../../convex/_generated/dataModel";
import { HistoryEntry } from "./useQuestionHistory";

function isHistoryEntry(item: unknown): item is HistoryEntry {
  return (item as HistoryEntry).question !== undefined;
}

/** A chosen style, tone or topic: its row id and the slug older questions carry instead. */
export interface FilterRef {
  _id: string;
  slug: string;
}

export interface QuestionFilterChoice {
  style?: FilterRef | null;
  tone?: FilterRef | null;
  topic?: FilterRef | null;
}

// A question points at its style, tone or topic by row id, by slug, or (older rows) by a
// legacy slug field; any of them matching counts.
const matches = (ref: FilterRef | null | undefined, id: string | undefined, ...slugs: (string | undefined)[]) =>
  !ref || id === ref._id || slugs.includes(ref.slug);

/** Narrow a list of questions (or history entries) by search text and the chosen filters. */
export const useFilter = <T extends Doc<"questions"> | HistoryEntry>(
  items: T[],
  searchText: string,
  choice: QuestionFilterChoice = {},
): T[] => {
  const { style, tone, topic } = choice;
  return useMemo((): T[] => {
    if (!items) return [] as T[];
    const needle = searchText.toLowerCase();
    return items.filter((item) => {
      const question: Doc<"questions"> = isHistoryEntry(item) ? item.question : item;
      if (!question) return false;
      // Personal and remixed questions keep their words in customText.
      const text = question.text ?? question.customText;
      if (!text) return false;
      return text.toLowerCase().includes(needle) &&
        matches(style, question.styleId, question.styleSlug, question.style) &&
        matches(tone, question.toneId, question.toneSlug, question.tone) &&
        matches(topic, question.topicId, question.topicSlug, question.topic);
    });
  }, [items, searchText, style, tone, topic]);
};
