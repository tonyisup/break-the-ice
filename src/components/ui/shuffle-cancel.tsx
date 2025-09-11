
import React from 'react';

export interface ShuffleCancelIconProps {
	alt?: string;
	size?: number;
	className?: string;
}

export const ShuffleCancelIcon = ({ alt = "Cancel", size = 24, className = "" }: ShuffleCancelIconProps) => {
	return (
		<svg 
			xmlns="http://www.w3.org/2000/svg" 
			width={size} 
			height={size} 
			viewBox="0 0 24 24" 
			fill="none" 
			stroke="currentColor" 
			strokeWidth="2" 
			strokeLinecap="round" 
			strokeLinejoin="round" 
			className={className}
			aria-label={alt}
		>
			<path d="M 19.894 20.15 L 18 22"/>
			<path d="m18 2 4 4-4 4"/>
			<path d="M 12.727 7.7 C 13.482 6.626 14.715 5.991 16.027 6 L 22 6"/>
			<path d="M 2 6 L 3.972 6 C 5.493 5.989 7.085 7.018 8.274 8.332"/>
			<path d="M 17.7 18 L 15.959 18 C 14.628 17.986 13.391 17.312 12.659 16.2 L 12.3 15.75"/>
			<path d="M 2.114 17.973 L 4.635 17.929 C 7.564 17.984 7.988 13.533 10.204 11.232"/>
			<path d="M 18.276 13.744 L 22.276 17.744"/>
			<path d="M 1.868 2.055 L 22.057 22.003"/>
		</svg>
	);
};
