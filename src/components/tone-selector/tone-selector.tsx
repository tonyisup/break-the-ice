import { useQuery } from 'convex/react';
import { 
  Smile, 
  Brain, 
  Briefcase, 
  Gamepad2, 
  Heart, 
  Flame, 
  Clock, 
  Trophy, 
  Leaf, 
  Eye,
  Mountain,
  HeartHandshake,
  Cpu,
  Zap,
  Archive,
  EyeOff,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';

const iconMap = {
  Smile,        // fun-silly
  Brain,        // deep-thoughtful
  Briefcase,    // professional
  Gamepad2,     // nerdy-geeky
  Heart,        // wholesome-heartwarming
  Flame,        // edgy-provocative
  Clock,        // nostalgic-retro
  Trophy,       // competitive-trivia
  Leaf,         // mindful-calm
  Eye,          // mysterious-intriguing
  HeartHandshake,   // wholesome-uplifting
  Mountain,     // outdoorsy-adventurous
  Cpu,          // nerdy-geeky
  Zap,          // quick-energizer
  Archive,      // nostalgic
  EyeOff,       // mysterious-intriguing
};


interface ToneSelectorProps {
  selectedTone: string;
  onSelectTone: (tone: string) => void;
}

export function ToneSelector({ selectedTone, onSelectTone }: ToneSelectorProps) {
  const tones = useQuery(api.tones.getTones);
  
  return (
    <div className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      {tones && tones.map((tone) => {
        const Icon = iconMap[tone.icon as keyof typeof iconMap];
        const isSelected = selectedTone === tone.id;

        return (
          <button
            key={tone.id}
            onClick={() => onSelectTone(tone.id)}
            className={`flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 ${
              isSelected 
                ? 'text-white shadow-lg' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            style={
              isSelected 
                ? {
                    backgroundColor: tone.color
                  }
                : {}
            }
          >
            <Icon size={20} />
            <span className="text-sm font-semibold whitespace-nowrap">
              {tone.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
