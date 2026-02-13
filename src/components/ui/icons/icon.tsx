import React from 'react';
import * as icons from './icons';

export type Icon = keyof typeof icons;
export const IconComponent = ({ icon, size = 24, color = "currentColor" }: { icon: Icon; size?: number; color?: string }) => {
  const IconNode = icons[icon] as React.ElementType || icons.CircleHelp;
  if (!IconNode || typeof IconNode === 'object' && !('$$typeof' in IconNode)) return null;
  return (React.createElement(IconNode, { size: size, color: color }))
};