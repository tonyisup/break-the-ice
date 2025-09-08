import { useQuery } from 'convex/react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  HelpCircle,
  GitBranch,
  Clock,
  Anchor,
  Zap,
  List,
  Heart,
  Box,
  MessageCircle,
  Type,
  Award,
  TrendingUp,
  Smile,
  GitPullRequest,
  BowArrow
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';

const iconMap = {
  HelpCircle,
  GitBranch,
  Clock,
  Anchor,
  Zap,
  List,
  Heart,
  Box,
  MessageCircle,
  Type,
  Award,
  TrendingUp,
  Smile,
  GitPullRequest,
  BowArrow
};

interface StyleSelectorProps {
  selectedStyle: string;
  onSelectStyle: (style: string) => void;
}

export interface StyleSelectorRef {
  randomizeStyle: () => void;
}
export const StyleSelector = forwardRef<StyleSelectorRef, StyleSelectorProps>(({ selectedStyle, onSelectStyle }, ref) => {
  const styles = useQuery(api.styles.getStyles);
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  
  // Convert styles to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = styles?.map(style => ({
    id: style.id,
    name: style.name,
    icon: style.icon,
    color: style.color
  }));

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    randomizeStyle: () => {
      genericSelectorRef.current?.randomizeItem();
    },
  }));

  return (
    <GenericSelector
      ref={genericSelectorRef}
      items={selectorItems}
      selectedItem={selectedStyle}
      onSelectItem={onSelectStyle}
      iconMap={iconMap}
      randomizeLabel="Randomize Style"
    />
  );
});
