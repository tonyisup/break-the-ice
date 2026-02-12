import React from 'react';
import * as icons from './icons';

export type Icon = keyof typeof icons;
export const IconComponent = ({ icon, size = 24, color = "currentColor" }: { icon: Icon; size?: number; color?: string }) => {
  const IconNode = icons[icon] || icons.CircleQuestionMark;
  if (!IconNode) return null;
  return (React.createElement(IconNode, { size: size, color: color }))
};