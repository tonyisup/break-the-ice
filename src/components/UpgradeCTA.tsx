
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface UpgradeCTAProps {
  bgGradient: [string, string];
  title: string;
  description: string;
  onUpgrade?: () => void;
}

export function UpgradeCTA({ bgGradient, title, description, onUpgrade }: UpgradeCTAProps) {
  return (
    <div className="w-full max-w-md mx-auto p-1 rounded-[30px]" style={{ background: `linear-gradient(135deg, ${bgGradient[0]}, ${bgGradient[1]})` }}>
      <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col gap-6 items-center text-center backdrop-blur-sm">
        <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            {description}
          </p>
        </div>

        <Button
          onClick={onUpgrade}
          className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white rounded-full py-6 text-lg font-bold shadow-lg transition-all hover:scale-105 hover:shadow-xl group"
        >
          <Sparkles className="w-5 h-5 mr-2 group-hover:animate-pulse" />
          Upgrade to Casual
        </Button>

        <p className="text-xs text-gray-500 dark:text-gray-500 italic">
          Get up to 100 AI generations per month and help support the project!
        </p>
      </div>
    </div>
  );
}
