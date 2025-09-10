import { ArrowBigRight, ArrowBigRightDash, RouteOff, Shuffle } from "lucide-react";
import { cn } from "../../lib/utils";

interface PageFooterProps {
  isGenerating: boolean;
  currentQuestion: any;
  randomizedStyle: string | null;
  randomizedTone: string | null;
  handleShuffleStyleAndTone: () => void;
  handleConfirmRandomizeStyleAndTone: () => void;
  handleCancelRandomizeStyleAndTone: () => void;
  handleCancelRandomAndNextQuestion: () => void;
  getNextQuestion: () => void;
  isColorDark: (color: string) => boolean;
  gradient: string[];
}

export const PageFooter = ({
  isGenerating,
  currentQuestion,
  randomizedStyle,
  randomizedTone,
  handleShuffleStyleAndTone,
  handleConfirmRandomizeStyleAndTone,
  handleCancelRandomizeStyleAndTone,
  handleCancelRandomAndNextQuestion,
  getNextQuestion,
  isColorDark,
  gradient,
}: PageFooterProps) => {
  return (
    <footer className="p-4">
      {randomizedStyle || randomizedTone ? (
        <div className="flex justify-center">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleShuffleStyleAndTone}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Shuffle Style and Tone"
              disabled={(!isGenerating || currentQuestion) ? false : true}
            >
              <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
            </button>
            <button
              onClick={handleConfirmRandomizeStyleAndTone}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="New Question / Confirm Shuffle"
            >
              <ArrowBigRightDash size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">New</span>
            </button>
            <button
              onClick={handleCancelRandomizeStyleAndTone}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Cancel Shuffle"
            >
              <RouteOff size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Cancel</span>
            </button>
            <button
              onClick={handleCancelRandomAndNextQuestion}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Next Question"
              disabled={(!isGenerating || currentQuestion) ? false : true}
            >
              <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Next</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleShuffleStyleAndTone}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Shuffle Style and Tone"
            >
              <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
            </button>
            <button
              onClick={getNextQuestion}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
              title="Next Question"
              disabled={isGenerating && !currentQuestion}
            >
              <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Next</span>
            </button>
          </div>
        </div>
      )}
    </footer>
  );
};
