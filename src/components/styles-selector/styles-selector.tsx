import { useQuery } from 'convex/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
  BowArrow,
  Scale
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import { GenericSelector, type GenericSelectorRef, type SelectorItem } from '../generic-selector';
import { useLocalStorage } from '../../hooks/useLocalStorage';

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
  BowArrow,
  Scale  
};

interface StyleSelectorProps {
  selectedStyle: string;
  randomOrder?: boolean;
  onSelectStyle: (style: string) => void;
}

export interface StyleSelectorRef {
  randomizeStyle: () => void;
}
export const StyleSelector = forwardRef<StyleSelectorRef, StyleSelectorProps>(({ selectedStyle, onSelectStyle, randomOrder = true }, ref) => {
  const styles = useQuery(api.styles.getStyles);
  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>('hiddenStyles', []);
  const genericSelectorRef = useRef<GenericSelectorRef>(null);
  
  const handleHideStyle = (styleId: string) => {
    setHiddenStyles(prev => [...new Set([...prev, styleId])]);
  };

  // Convert styles to the format expected by GenericSelector
  const selectorItems: SelectorItem[] | undefined = useMemo(() => styles
    ?.filter(style => !hiddenStyles.includes(style.id))
    .map(style => ({
      id: style.id,
      name: style.name,
      icon: style.icon,
      color: style.color
    })), [styles, hiddenStyles]);

  // Expose the randomizeStyle function to parent components
  useImperativeHandle(ref, () => ({
    randomizeStyle: () => {
      genericSelectorRef.current?.randomizeItem();
    },
  }));

  useEffect(() => {
    if (!randomOrder) {
      return;
    }
    if (onSelectStyle && selectorItems) {
      onSelectStyle(selectorItems[0].id);
    }
  }, [randomOrder, selectorItems, onSelectStyle]);

  return (
    <GenericSelector
      ref={genericSelectorRef}
      items={selectorItems}
      selectedItem={selectedStyle}
      onSelectItem={onSelectStyle}
      onHideItem={handleHideStyle}
      iconMap={iconMap}
      randomizeLabel="Randomize Style"
    />
  );
});
