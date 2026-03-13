import '@testing-library/jest-dom/vitest';

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = function scrollIntoViewMock() {
  /* jsdom mock */
};

// Mock IntersectionObserver for tests that render DiffViewer.
// Immediately reports all observed elements as intersecting so content renders.
globalThis.IntersectionObserver = class IntersectionObserver {
  readonly root = undefined;
  readonly rootMargin = '';
  readonly thresholds = [0];
  private readonly cb: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.cb = callback;
  }
  observe(target: Element) {
    this.cb(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry,
      ],
      this as unknown as globalThis.IntersectionObserver,
    );
  }
  unobserve() {
    /* jsdom mock */
  }
  disconnect() {
    /* jsdom mock */
  }
  takeRecords() {
    return [];
  }
} as unknown as typeof globalThis.IntersectionObserver;
