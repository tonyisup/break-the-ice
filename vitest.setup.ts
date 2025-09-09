import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock scroll-related methods that JSDOM doesn't implement
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(window, 'scroll', {
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(window, 'scrollBy', {
  value: vi.fn(),
  writable: true,
});

// Mock scrollIntoView for elements
Element.prototype.scrollIntoView = vi.fn();

// Mock getBoundingClientRect to return reasonable defaults
Element.prototype.getBoundingClientRect = vi.fn(() => ({
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  x: 0,
  y: 0,
  toJSON: vi.fn(),
}));
