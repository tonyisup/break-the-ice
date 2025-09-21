import React from 'react';

interface GradientXIconProps {
  size?: number;
  gradient: (string | undefined)[];
  className?: string;
}

export const GradientXIcon: React.FC<GradientXIconProps> = ({ size = 24, gradient, className }) => {
  const gradientId = "x-icon-gradient";
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
};
