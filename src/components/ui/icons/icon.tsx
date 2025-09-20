import React from 'react';
import * as icons from './icons';

export type Icon = keyof typeof icons;
export const IconComponent = ({ icon, size = 24, color = "currentColor" }: { icon: Icon; size?: number; color?: string }) => {
  return (React.createElement(icons[icon], { size: size, color: color }))
};