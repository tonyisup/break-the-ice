import { randomInt } from 'crypto';
import React from 'react';

interface GradientShuffleIconProps {
  size?: number;
  className?: string; 
}

const styleColors = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
  "#F38181",
  "#AA96DA",
  "#FCBAD3",
  "#A8E6CF",
  "#FFD93D",
  "#FD79A8",
  "#FDCB6E",
  "#81ECEC",
  "#E57373",
]
const toneColors = [
  "#FFAB91",
  "#6A67CE",
  "#4CAF50",
  "#3F51B5",
  "#FFC107",
  "#FF8A65",
  "#673AB7",
  "#81C784",
  "#E57373",
  "#4DB6AC",
  "#66BB6A",
]
export const GradientShuffleIcon: React.FC<GradientShuffleIconProps> = ({ size = 24, className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        {/* Top left gradient with style colors */}
        <linearGradient id="topLeftGradient" x1="0%" y1="0%" x2="50%" y2="50%">
          {styleColors.map((color, index) => (
            <stop 
              key={index} 
              offset={`${(index / (styleColors.length - 1)) * 100}%`} 
              stopColor={color} 
            />
          ))}
        </linearGradient>
        
        {/* Bottom right gradient with tone colors */}
        <linearGradient id="bottomRightGradient" x1="50%" y1="50%" x2="100%" y2="100%">
          {toneColors.map((color, index) => (
            <stop 
              key={index} 
              offset={`${(index / (toneColors.length - 1)) * 100}%`} 
              stopColor={color} 
            />
          ))}
        </linearGradient>
      </defs>
      
      {/* Top left paths with style gradient */}
      <path d="m18 2 4 4-4 4" stroke="url(#topLeftGradient)" />
      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" stroke="url(#topLeftGradient)" />
      
      {/* Bottom right paths with tone gradient */}
      <path d="m18 14 4 4-4 4" stroke="url(#bottomRightGradient)" />
      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" stroke="url(#bottomRightGradient)" />
      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" stroke="url(#bottomRightGradient)" />
    </svg>
  );
};