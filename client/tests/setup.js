import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no matchMedia. Pretend the user prefers reduced motion so animated numbers show their final value at once.
window.matchMedia = window.matchMedia || ((query) => ({
  matches: query.includes('prefers-reduced-motion'),
  media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
