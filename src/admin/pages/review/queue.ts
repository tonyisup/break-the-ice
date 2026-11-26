import type { Doc, Id } from "@convex/_generated/dataModel";
import { MAX_REVIEW_BATCH } from "@convex/constants";
import { editorialReasonLabels } from "@convex/lib/questionReviewValidators";

export type ReviewQuestion = Doc<"questions">;
export type RejectReason = keyof typeof editorialReasonLabels;
/** The reject reasons in key order: key 1 is the first. */
export const REJECT_REASONS = Object.keys(editorialReasonLabels) as RejectReason[];

export type ClaudeFilter = "all" | "keep" | "hold" | "unchecked";
export type SourceFilter = "all" | "ai" | "people";

/** A hold or any safety flag: the same rule as the Claude verdict badge. */
export function claudeConcern(question: ReviewQuestion): boolean {
  const check = question.qualityCheck;
  return !!check && (check.verdict === "hold" || check.safety.length > 0);
}

export function matchesFilters(question: ReviewQuestion, claude: ClaudeFilter, source: SourceFilter): boolean {
  if (source === "ai" && !question.isAIGenerated) return false;
  if (source === "people" && question.isAIGenerated) return false;
  if (claude === "unchecked") return !question.qualityCheck;
  if (claude === "keep") return !!question.qualityCheck && !claudeConcern(question);
  if (claude === "hold") return claudeConcern(question);
  return true;
}

export function shownText(question: Pick<ReviewQuestion, "text" | "customText">): string {
  return question.text || question.customText || "";
}

/**
 * Which questions a decision acts on: every selected question still in view, or, with nothing
 * selected, the one in focus. Selected questions hidden by a filter are not decided unseen.
 */
export function decisionTarget(
  visible: ReviewQuestion[],
  selected: ReadonlySet<Id<"questions">>,
  focusedId: Id<"questions"> | null,
): ReviewQuestion[] {
  if (selected.size > 0) return visible.filter((q) => selected.has(q._id));
  const focused = visible.find((q) => q._id === focusedId);
  return focused ? [focused] : [];
}

/** A selection split into reviews the server accepts (MAX_REVIEW_BATCH each). */
export function reviewBatches<T>(items: T[], size = MAX_REVIEW_BATCH): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  return batches;
}

/**
 * Where focus goes after the focused question leaves the list: the question that took its
 * place, or the new last one.
 */
export function nextFocus(
  previous: ReviewQuestion[],
  current: ReviewQuestion[],
  focusedId: Id<"questions"> | null,
): Id<"questions"> | null {
  if (current.length === 0) return null;
  if (focusedId && current.some((q) => q._id === focusedId)) return focusedId;
  const oldIndex = previous.findIndex((q) => q._id === focusedId);
  // Nothing was in focus, or it wasn't in the old list (a filter changed): start at the top.
  if (oldIndex === -1) return current[0]._id;
  // The first question after the old position that is still here.
  for (let i = oldIndex; i < previous.length; i++) {
    const survivor = current.find((q) => q._id === previous[i]._id);
    if (survivor) return survivor._id;
  }
  return current[current.length - 1]._id;
}

export type QueueKeyAction =
  | { type: "move"; by: 1 | -1 }
  | { type: "toggleSelect" }
  | { type: "selectAll" }
  | { type: "clear" }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "toggleReason"; reason: RejectReason }
  | { type: "editText" }
  | { type: "editNote" }
  | { type: "help" };

/** The queue's keyboard shortcuts, for the help dialog. */
export const QUEUE_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "J / ↓", label: "Next question" },
  { keys: "K / ↑", label: "Previous question" },
  { keys: "X", label: "Select or unselect" },
  { keys: "⌘A", label: "Select all shown" },
  { keys: "A", label: "Approve" },
  { keys: "R", label: "Reject" },
  ...REJECT_REASONS.map((reason, i) => ({ keys: String(i + 1), label: `Reason: ${editorialReasonLabels[reason]}` })),
  { keys: "E", label: "Edit the wording" },
  { keys: "N", label: "Write a note" },
  { keys: "Esc", label: "Clear selection" },
  { keys: "?", label: "Show shortcuts" },
];

/** What a key press does in the queue, or null when it isn't a shortcut. */
export function queueKeyAction(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): QueueKeyAction | null {
  const { key } = event;
  if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") return { type: "selectAll" };
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (key) {
    case "j":
    case "ArrowDown":
      return { type: "move", by: 1 };
    case "k":
    case "ArrowUp":
      return { type: "move", by: -1 };
    case "x":
      return { type: "toggleSelect" };
    case "a":
      return { type: "approve" };
    case "r":
      return { type: "reject" };
    case "e":
      return { type: "editText" };
    case "n":
      return { type: "editNote" };
    case "Escape":
      return { type: "clear" };
    case "?":
      return { type: "help" };
  }
  const index = Number(key) - 1;
  if (Number.isInteger(index) && index >= 0 && index < REJECT_REASONS.length) {
    return { type: "toggleReason", reason: REJECT_REASONS[index] };
  }
  return null;
}

/** Whether a key press is typing, which shortcuts must leave alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // A checkbox just clicked keeps focus, and the queue's keys must still work.
  if (target instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit"].includes(target.type);
  return target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName);
}
