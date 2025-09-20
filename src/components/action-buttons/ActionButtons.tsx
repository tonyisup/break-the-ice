import { ArrowBigRight, ArrowBigRightDash, Shuffle, X, SquareArrowRight } from '@/components/ui/icons';
import { cn } from "../../lib/utils";

interface ActionButtonsProps {
  isColorDark: (color: string) => boolean;
  gradient: string[];
  isGenerating: boolean;
  currentQuestion: any;
  randomizedStyle: string | null;
  randomizedTone: string | null;
  handleShuffleStyleAndTone: () => void;
  handleConfirmRandomizeStyleAndTone: () => void;
  handleCancelRandomizeStyleAndTone: () => void;
  getNextQuestion: () => void;
  isStyleTonesOpen: boolean;
  disabled?: boolean;
}

export const ActionButtons = ({
  isColorDark,
  gradient,
  isGenerating,
  currentQuestion,
  randomizedStyle,
  randomizedTone,
  handleShuffleStyleAndTone,
  handleConfirmRandomizeStyleAndTone,
  handleCancelRandomizeStyleAndTone,
  getNextQuestion,
  isStyleTonesOpen,
  disabled = false,
}: ActionButtonsProps) => {
  return (
    <>
      {randomizedStyle || randomizedTone ? (
        <div className="flex justify-center">
          <div className="flex  gap-4">
            <button
              onClick={handleCancelRandomizeStyleAndTone}
              disabled={disabled}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors disabled:opacity-50")}
              title="Cancel Shuffle"
            >
              <X size={24} className={isColorDark(gradient[1]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Cancel</span>
            </button>
            <button
              onClick={handleShuffleStyleAndTone}
              disabled={disabled || (!isGenerating || currentQuestion) ? false : true}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors disabled:opacity-50")}
              title="Shuffle Style and Tone"
            >
              <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
            </button>
            <button
              onClick={handleConfirmRandomizeStyleAndTone}
              disabled={disabled}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors disabled:opacity-50")}
              title="New Question / Confirm Shuffle"
            >
              <ArrowBigRightDash size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
              <span className="sm:block hidden text-white font-semibold text-base">New</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center p-4">
          {isStyleTonesOpen ? (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleShuffleStyleAndTone}
              disabled={disabled}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Shuffle Style and Tone"
              >
                <Shuffle size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Shuffle</span>
              </button>
              <button
                onClick={getNextQuestion}
                disabled={disabled || (isGenerating && !currentQuestion)}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Next Question"
              >
                <ArrowBigRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="sm:block hidden text-white font-semibold text-base">Next</span>
              </button>
            </div>
          ) : (
              <button
                onClick={handleShuffleStyleAndTone}
                className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors")}
                title="Shuffle Style and Tone"
                disabled={isGenerating && !currentQuestion}
              >
                <SquareArrowRight size={24} className={isColorDark(gradient[0]) ? "text-black" : "text-white"} />
                <span className="text-white font-semibold text-base">New</span>
              </button>
          )}
        </div>
      )}
    </>
  );
};
