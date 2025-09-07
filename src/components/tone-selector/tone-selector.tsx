import { useQuery } from 'convex/react';
import { useRef, useEffect } from 'react';
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
  Shuffle,
  BowArrow,
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
  BowArrow
};


interface ToneSelectorProps {
  selectedTone: string;
  onSelectTone: (tone: string) => void;
}

export function ToneSelector({ selectedTone, onSelectTone }: ToneSelectorProps) {
  const tones = useQuery(api.tones.getTones);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  
  const scrollToCenter = (toneId: string) => {
    const container = containerRef.current;
    const button = buttonRefs.current[toneId];
    
    if (container && button) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      // Calculate the scroll position to center the button
      const scrollLeft = button.offsetLeft - (containerRect.width / 2) + (buttonRect.width / 2);
      
      container.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  };
  
  const handleRandomTone = () => {
    if (!tones) return;
    const randomTone = tones[Math.floor(Math.random() * tones.length)];
    onSelectTone(randomTone.id);
    
    // Scroll to center the randomly selected tone after a brief delay
    setTimeout(() => {
      scrollToCenter(randomTone.id);
    }, 100);
  };

  return (
    <div ref={containerRef} className="flex gap-3 px-5 py-3 overflow-x-auto scrollbar-hide">
      
      <button
        onClick={handleRandomTone}
        className="flex items-center gap-2 px-4 h-10 rounded-full transition-all duration-200 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <Shuffle size={20} />
      </button>
      {tones && tones.map((tone) => {
        const Icon = iconMap[tone.icon as keyof typeof iconMap];
        const isSelected = selectedTone === tone.id;

        return (
          <button
            key={tone.id}
            ref={(el) => {
              buttonRefs.current[tone.id] = el;
            }}
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
