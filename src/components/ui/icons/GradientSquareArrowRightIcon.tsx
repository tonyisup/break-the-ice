import React from 'react';

interface GradientSquareArrowRightIconProps {
  size?: number;
  gradient: (string | undefined)[];
  className?: string;
}

export const GradientSquareArrowRightIcon: React.FC<GradientSquareArrowRightIconProps> = ({ size = 24, gradient, className }) => {
  const gradientId = "icon-gradient";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="100%" stopColor={gradient[1]} />
        </linearGradient>
      </defs>
      <path d="M12 16l4 -4l-4 -4" />
      <path d="M8 12h8" />
      <path d="M3 3m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    </svg>
  );
};
