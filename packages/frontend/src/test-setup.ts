import '@testing-library/jest-dom/vitest';

// Mock IntersectionObserver for tests that render DiffViewer.
// Immediately reports all observed elements as intersecting so content renders.
globalThis.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [0];
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
  observe(target: Element) {
    this.cb([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof globalThis.IntersectionObserver;
