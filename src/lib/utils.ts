import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isColorDark(color: string) {
  const [r, g, b] = color.match(/\w\w/g)!.map(hex => parseInt(hex, 16));
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
};

