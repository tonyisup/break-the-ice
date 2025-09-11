import React from 'react';

interface SvgIconProps {
  src: string;
  alt: string;
  size?: number;
  className?: string;
}

export const SvgIcon: React.FC<SvgIconProps> = ({ 
  src, 
  alt, 
  size = 24, 
  className = "" 
}) => {
  return (
    <img 
      src={src} 
      alt={alt} 
      width={size} 
      height={size} 
      className={className}
    />
  );
};
