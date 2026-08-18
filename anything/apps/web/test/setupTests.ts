import '@testing-library/jest-dom';

// S9: the SSE route reads this per request — 0 closes each stream right
// after the first tick so suites never hold live timers.
process.env.STREAM_MAX_MS = '0';
// S17 component harness: jsdom lacks a couple of browser APIs the UI kit
// touches (Radix Slider observes element size; some primitives probe media
// queries). Inert stubs — component tests assert behavior, not geometry.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
