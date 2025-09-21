import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isColorDark(color: string) {
  // Fallback for invalid input
  try {
    if (typeof color !== 'string') return false;
    // Normalize hex color, support formats like #RGB, #RRGGBB
    let hex = color.trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return false;
    }
    const [r, g, b] = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  } catch {
    return false;
  }
};