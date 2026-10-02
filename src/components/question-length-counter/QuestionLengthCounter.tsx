import { cn } from "@/lib/utils";
import { ERROR_MESSAGES, MAX_QUESTION_TEXT_LENGTH } from "../../../convex/constants";

interface QuestionLengthCounterProps {
  /** Referenced by the question input's aria-describedby. */
  id: string;
  length: number;
}

/**
 * How much of the question length limit a draft uses, shown under a question input
 * so its maxLength never cuts text off without notice. Screen readers hear about the
 * limit only once it is reached, not on every keystroke.
 */
export function QuestionLengthCounter({ id, length }: QuestionLengthCounterProps) {
  const atLimit = length >= MAX_QUESTION_TEXT_LENGTH;
  return (
    <>
      <p
        id={id}
        className={cn(
          "text-right text-xs tabular-nums",
          atLimit ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
        )}
      >
        {length}/{MAX_QUESTION_TEXT_LENGTH}
        <span className="sr-only"> characters</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {atLimit ? ERROR_MESSAGES.QUESTION_TEXT_TOO_LONG : ""}
      </p>
    </>
  );
}
