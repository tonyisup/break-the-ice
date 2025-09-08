import { useQuery } from 'convex/react';
import { useRef, forwardRef, useImperativeHandle } from 'react';
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
  BowArrow,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';

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

export interface ToneSelectorRef {
  randomizeTone: () => void;
}

export const ToneSelector = forwardRef<ToneSelectorRef, ToneSelectorProps>(({ selectedTone, onSelectTone }, ref) => {
  const tones = useQuery(api.tones.getTones);
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  
  // Convert tones to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = tones?.map(tone => ({
    id: tone.id,
    name: tone.name,
    icon: tone.icon,
    color: tone.color
  }));

  // Expose the randomizeTone function to parent components
  useImperativeHandle(ref, () => ({
    randomizeTone: () => {
      genericSelectorRef.current?.randomizeItem();
    },
  }));

  return (
    <GenericSelector
      ref={genericSelectorRef}
      items={selectorItems}
      selectedItem={selectedTone}
      onSelectItem={onSelectTone}
      iconMap={iconMap}
      randomizeLabel="Randomize Tone"
    />
  );
});
