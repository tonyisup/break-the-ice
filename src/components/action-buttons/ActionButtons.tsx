import { ArrowBigRight, Shuffle, X, SquareArrowRight } from '@/components/ui/icons/icons';
import { cn } from "../../lib/utils";
import { GradientSquareArrowRightIcon } from '../ui/icons/GradientSquareArrowRightIcon';
import { GradientArrowRightIcon } from '../ui/icons/GradientArrowRightIcon';
import { GradientXIcon } from '../ui/icons/GradientXIcon';

interface ActionButtonsProps {
  isColorDark: (color: string) => boolean;
  gradient: string[];
  shuffledGradient: (string | undefined)[];
  isGenerating: boolean;
  handleShuffleStyleAndTone: () => void;
  handleConfirmRandomizeStyleAndTone: () => void;
  handleCancelRandomizeStyleAndTone: () => void;
  getNextQuestion: () => void;
  isStyleTonesOpen: boolean;
  isHighlighting: boolean;
  setIsHighlighting: (isHighlighting: boolean) => void;
}

export const ActionButtons = ({
  isColorDark,
  gradient,
  shuffledGradient,
  isGenerating,
  handleShuffleStyleAndTone,
  handleConfirmRandomizeStyleAndTone,
  handleCancelRandomizeStyleAndTone,
  getNextQuestion,
  isStyleTonesOpen,
  isHighlighting,
  setIsHighlighting,
}: ActionButtonsProps) => {

  const handleCancelShuffle = () => {
    setIsHighlighting(false);
    handleCancelRandomizeStyleAndTone();
  }

  const handleShuffle = () => {
    setIsHighlighting(true);
    handleShuffleStyleAndTone();
  }

  const handleConfirmShuffle = () => {
    setIsHighlighting(false);
    handleConfirmRandomizeStyleAndTone();
  }

  return (
    <>
      {isStyleTonesOpen ? (
        <div className="flex justify-center p-4">
          <div className="flex gap-4">
            {isHighlighting && <button
              onClick={handleCancelShuffle}
              className={cn(isColorDark(gradient[0]) ? "bg-white/20 dark:bg-white/20" : "bg-black/20 dark:bg-black/20", " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors disabled:opacity-50")}
              title="Cancel Shuffle"
            >
              {isHighlighting && gradient[0] && gradient[1] ? (
                <GradientXIcon size={24} gradient={gradient} />
              ) : (
                <X size={24} className={isColorDark(gradient[1]) ? "text-black" : "text-white"} />
              )}
              {/* <span className="sm:block hidden text-white font-semibold text-base">Cancel</span> */}
            </button>}
            <button
              onClick={handleShuffle}
              className={cn(
                isColorDark(gradient[0])
                  ? "bg-white/20 dark:bg-white/20"
                  : "bg-black/20 dark:bg-black/20",
                " px-5 py-3 rounded-full flex items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
              )}
              title="Shuffle Style and Tone"
            >
              <Shuffle
                size={24}
                className={isColorDark(gradient[0]) ? "text-black" : "text-white"}
              />
              <span className="sm:block hidden text-white font-semibold text-base">
                Shuffle
              </span>
            </button>
            {isHighlighting && <button
              onClick={handleConfirmShuffle}
              disabled={isGenerating}
              className={cn(
                isColorDark(gradient[0])
                  ? "bg-white/20 dark:bg-white/20"
                  : "bg-black/20 dark:bg-black/20",
                "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
              )}
              title="Shuffle Style and Tone"
            >
              {isHighlighting && shuffledGradient[0] && shuffledGradient[1] ? (
                <GradientSquareArrowRightIcon size={24} gradient={shuffledGradient} />
              ) : (
                <SquareArrowRight
                  size={24}
                  className={isColorDark(gradient[0]) ? "text-black" : "text-white"}
                />
              )}
              {/* <span className="text-white font-semibold text-base">New</span> */}
            </button>}
          </div>
        </div>
      ) : (
        <div className="flex justify-center p-4 gap-4">
          <button
            onClick={handleShuffleStyleAndTone}
            className={cn(
              isColorDark(gradient[0])
                ? "bg-white/20 dark:bg-white/20"
                : "bg-black/20 dark:bg-black/20",
              "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
            )}
            title="Shuffle Style and Tone"
            disabled={isGenerating}
          >
            <Shuffle
              size={24}
              className={isColorDark(gradient[0]) ? "text-black" : "text-white"}
            />
            <span className="text-white font-semibold text-base">New</span>
          </button>
          <button
            onClick={getNextQuestion}
            className={cn(
              isColorDark(gradient[0])
                ? "bg-white/20 dark:bg-white/20"
                : "bg-black/20 dark:bg-black/20",
              "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-black/30 dark:hover:bg-white/30 transition-colors"
            )}
            title="Next Question"
            disabled={isGenerating}
          >
            <GradientArrowRightIcon size={24} gradient={gradient} />
            <span className="text-white font-semibold text-base">Next</span>
          </button>
        </div>
      )}
    </>
  );
};
