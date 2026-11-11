import { Clock } from "lucide-react";

interface AiLimitNoticeProps {
  title: string;
  description: string;
}

/** A status, not an offer: the feed stopped making new questions until the cycle resets. */
export function AiLimitNotice({ title, description }: AiLimitNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-md mx-auto rounded-2xl border border-white/15 bg-white/90 dark:bg-gray-900/90 p-6 flex gap-4 items-start backdrop-blur-sm"
    >
      <Clock aria-hidden="true" className="w-6 h-6 mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
