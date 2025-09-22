import React from 'react';
import { icons, Circle } from 'lucide-react';
import { LucideProps } from 'lucide-react';

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
  let iconName = toPascalCase(name);

  // Special case for HelpCircle -> CircleHelp
  if (iconName === 'HelpCircle') {
    iconName = 'CircleHelp';
  }

  // @ts-expect-error - We are using a dynamic name to access the icon
  const LucideIcon = icons[iconName];

  if (!LucideIcon) {
    // Fallback to a default icon
    return <Circle {...props} />;
  }

  return <LucideIcon {...props} />;
};

export default DynamicIcon;
