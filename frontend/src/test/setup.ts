import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof matchMedia
}

function testRectList(): DOMRectList {
  const rect = DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 20 })
  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
    [Symbol.iterator]: function* () {
      yield rect
    },
  } as DOMRectList
}

if (globalThis.document && !document.elementFromPoint) {
  document.elementFromPoint = (() => document.body) as typeof document.elementFromPoint
}

if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = testRectList
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = testRectList
}

if (globalThis.Text && !(Text.prototype as Text & { getClientRects?: () => DOMRectList }).getClientRects) {
  ;(Text.prototype as Text & { getClientRects: () => DOMRectList }).getClientRects = testRectList
}

window.scrollBy = (() => {}) as typeof window.scrollBy
