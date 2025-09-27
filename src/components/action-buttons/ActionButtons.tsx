import { Shuffle, X, SquareArrowRight } from '@/components/ui/icons/icons';
import { cn } from "../../lib/utils";
import { GradientSquareArrowRightIcon } from '../ui/icons/GradientSquareArrowRightIcon';
import { GradientArrowRightIcon } from '../ui/icons/GradientArrowRightIcon';
import { GradientXIcon } from '../ui/icons/GradientXIcon';
import { GradientShuffleIcon } from '../ui/icons/GradientShuffleIcon';

const styleColors = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#AA96DA",
  "#FCBAD3",
  "#A8E6CF",
  "#FFD93D",
  "#FD79A8",
  "#FDCB6E",
  "#81ECEC",
  "#E57373",
];

const toneColors = [
  "#FFAB91",
  "#6A67CE",
  "#4CAF50",
  "#3F51B5",
  "#FFC107",
  "#FF8A65",
  "#673AB7",
  "#81C784",
  "#E57373",
  "#4DB6AC",
  "#66BB6A",
];

const allColors = [...styleColors, ...toneColors];

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
                className={isColorDark(gradient[0]) ? "text-black" : "dark:text-white"}
              />
              <span className="sm:block hidden text-black dark:text-white font-semibold text-base">
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
          <div
            style={{
              background: `conic-gradient(from 270deg, ${allColors.sort(() => Math.random() - 0.5).map((color, index) => 
                `${color} ${(index / (allColors.length - 1)) * 100}%`
              ).join(', ')})`,
            }}
            className="px-1 py-1 rounded-full"
          >
            <button
              onClick={handleShuffleStyleAndTone}
              className={cn(
                "text-black dark:text-white bg-white dark:bg-black",
                "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-white/80 dark:hover:bg-black/80 transition-colors"
              )}
              title="Shuffle Style and Tone"
              disabled={isGenerating}
            >
              <GradientShuffleIcon size={24} />
              <span className="font-semibold text-base">New</span>
            </button>
          </div>
          <div
            style={{
              background: `linear-gradient(135deg, ${gradient[1]}, ${gradient[0]})`,
            }}
            className="px-1 py-1 rounded-full"
          >
            <button
              onClick={getNextQuestion}
              className={cn(
                "text-black dark:text-white bg-white dark:bg-black",
                "px-5 py-3 rounded-full flex justify-center items-center gap-2 hover:bg-white/80 dark:hover:bg-black/80 transition-colors"
              )}
              title="Next Question"
              disabled={isGenerating}
            >
              <GradientArrowRightIcon size={24} gradient={gradient} />
              <span className="font-semibold text-base">Next</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
