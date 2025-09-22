import React from 'react';
import { icons } from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
  name: string;
}

const toPascalCase = (str: string) => {
  return str.replace(/(^\w|-\w)/g, (text) => text.replace(/-/, "").toUpperCase());
};

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  const iconName = toPascalCase(name);
  // @ts-expect-error - We are using a dynamic name to access the icon
  const LucideIcon = icons[iconName];

  if (!LucideIcon) {
    // You can return a default icon or null
    return null;
  }

  return <LucideIcon {...props} />;
};

export default DynamicIcon;
