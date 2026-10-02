import { MAX_QUESTION_TEXT_LENGTH } from "../constants";

export function normalizePersistableTeamPromptText(
  value: string,
): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_QUESTION_TEXT_LENGTH) {
    return null;
  }
  return normalized;
}
