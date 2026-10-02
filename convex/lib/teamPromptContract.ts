import { ConvexError } from "convex/values";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_TEAM_TOPIC_BOUNDARIES_LENGTH,
  MAX_TEAM_TOPIC_GUIDANCE_LENGTH,
  MAX_TEAM_TOPIC_NAME_LENGTH,
} from "../constants";

export function normalizePersistableTeamPromptText(
  value: string,
): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_QUESTION_TEXT_LENGTH) {
    return null;
  }
  return normalized;
}

const TEAM_TOPIC_FIELDS = {
  name: {
    maxLength: MAX_TEAM_TOPIC_NAME_LENGTH,
    required: ERROR_MESSAGES.TEAM_TOPIC_NAME_REQUIRED,
    tooLong: ERROR_MESSAGES.TEAM_TOPIC_NAME_TOO_LONG,
  },
  guidance: {
    maxLength: MAX_TEAM_TOPIC_GUIDANCE_LENGTH,
    required: ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_REQUIRED,
    tooLong: ERROR_MESSAGES.TEAM_TOPIC_GUIDANCE_TOO_LONG,
  },
  boundaries: {
    maxLength: MAX_TEAM_TOPIC_BOUNDARIES_LENGTH,
    tooLong: ERROR_MESSAGES.TEAM_TOPIC_BOUNDARIES_TOO_LONG,
  },
} as const;

function checkTeamTopicLength(
  text: string,
  field: keyof typeof TEAM_TOPIC_FIELDS,
): string {
  const { maxLength, tooLong } = TEAM_TOPIC_FIELDS[field];
  if (text.length > maxLength) {
    throw new ConvexError({
      code: ERROR_CODES.TEAM_TOPIC_TOO_LONG,
      message: tooLong,
    });
  }
  return text;
}

/**
 * The trimmed text of a required Team topic field. Blank or over-long text throws a
 * ConvexError naming the field, whose message reaches the client in production.
 */
export function requireTeamTopicText(
  value: string,
  field: "name" | "guidance",
): string {
  const text = value.trim();
  if (!text) {
    throw new ConvexError({
      code: ERROR_CODES.TEAM_TOPIC_REQUIRED,
      message: TEAM_TOPIC_FIELDS[field].required,
    });
  }
  return checkTeamTopicLength(text, field);
}

/** The trimmed text of an optional Team topic field, or undefined when it is blank. */
export function optionalTeamTopicText(
  value: string | undefined,
  field: "boundaries",
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return checkTeamTopicLength(text, field);
}
