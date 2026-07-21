export const MAX_TEAM_PROMPT_TEXT_LENGTH = 500;

export function normalizePersistableTeamPromptText(
  value: string,
): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_TEAM_PROMPT_TEXT_LENGTH) {
    return null;
  }
  return normalized;
}
