import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseHexColor(color: string): [number, number, number] | null {
  if (!color) return null;
  const trimmed = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return [
      parseInt(trimmed[0] + trimmed[0], 16),
      parseInt(trimmed[1] + trimmed[1], 16),
      parseInt(trimmed[2] + trimmed[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return [
      parseInt(trimmed.slice(0, 2), 16),
      parseInt(trimmed.slice(2, 4), 16),
      parseInt(trimmed.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * WCAG 2.1 relative luminance check: returns true when white text has higher contrast
 * against `color` than black text does. Safe for malformed or non-hex color strings.
 */
export function isColorDark(color: string): boolean {
  const rgb = parseHexColor(color);
  if (!rgb) return true;
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white (1.0) vs black (0.0): equal around L = 0.179.
  return luminance < 0.179;
}
