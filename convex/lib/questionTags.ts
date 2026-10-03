import { ConvexError } from "convex/values";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MAX_QUESTION_TAG_LENGTH,
  MAX_QUESTION_TAGS,
} from "../constants";

/**
 * The tags of a question someone wrote, checked before they are saved: trimmed and lowercased
 * like the tag names people pick from, with blanks and repeats dropped. Too many tags, or an
 * over-long one, throws a ConvexError, whose message reaches the client in production.
 * Undefined stays undefined, so a write without tags keeps meaning "no tags".
 *
 * Tags don't have to exist in the tags table: admins create tags freely (the generator and the
 * question editor take free text) and can rename or delete them, so requiring a match would
 * refuse saves of questions whose tags were valid when they were set.
 */
export function normalizeQuestionTags(tags: string[] | undefined): string[] | undefined {
  if (tags === undefined) return undefined;
  const normalized: string[] = [];
  for (const value of tags) {
    const tag = value.trim().toLowerCase();
    if (!tag || normalized.includes(tag)) continue;
    if (tag.length > MAX_QUESTION_TAG_LENGTH) {
      throw new ConvexError({
        code: ERROR_CODES.QUESTION_TAG_TOO_LONG,
        message: ERROR_MESSAGES.QUESTION_TAG_TOO_LONG,
      });
    }
    normalized.push(tag);
    if (normalized.length > MAX_QUESTION_TAGS) {
      throw new ConvexError({
        code: ERROR_CODES.QUESTION_TAGS_TOO_MANY,
        message: ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY,
      });
    }
  }
  return normalized;
}
