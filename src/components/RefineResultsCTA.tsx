
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

interface RefineResultsCTAProps {
  bgGradient: [string, string];
  onDismiss: () => void;
}

export function RefineResultsCTA({ bgGradient, onDismiss }: RefineResultsCTAProps) {
  return (
    <div className="relative w-full max-w-md mx-auto p-1 rounded-[30px]" style={{ background: `linear-gradient(135deg, ${bgGradient[1]}, ${bgGradient[0]})` }}>
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors z-10"
        title="Don't show again"
      >
        <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>
      <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col gap-6 items-center text-center">
        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            Not liking what you're seeing?
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            Refine your results!
          </p>
        </div>
        <Link
          to="/settings?expand=manage-styles,manage-tones"
          className="w-full"
        >
          <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full py-6 text-lg font-bold shadow-lg transition-all hover:scale-105 hover:shadow-xl">
            Go to Settings
          </Button>
        </Link>
        <button
          onClick={onDismiss}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline underline-offset-4 transition-colors"
        >
          Don't show this again
        </button>
      </div>
    </div>
  );
}
