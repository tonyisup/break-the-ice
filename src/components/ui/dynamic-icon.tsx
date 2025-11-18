import React from 'react';

import { LucideProps } from 'lucide-react';
import { iconMap, Circle } from '@/components/ui/icons/icons';

interface DynamicIconProps extends LucideProps {
  name: string;
}

const toPascalCase = (str: string) => {
  return str
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    )
    .replace(/^[a-z]/, (char) => char.toUpperCase());
};

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  const iconName = toPascalCase(name);
  
  const IconComponent = iconMap[iconName];

  if (!IconComponent) {
    // Fallback to a default icon
    return <Circle {...props} />;
  }

  return <IconComponent {...props} />;
};

export default DynamicIcon;
