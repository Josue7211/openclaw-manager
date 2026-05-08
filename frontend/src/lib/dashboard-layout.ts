import type { LayoutItem } from './dashboard-store'

const DEFAULT_BREAKPOINTS = ['xl', 'lg', 'md', 'sm'] as const
const DEFAULT_COLS: Record<string, number> = {
  xl: 12,
  lg: 12,
  md: 8,
  sm: 4,
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y
}

function normalizeItem(item: LayoutItem, cols: number): LayoutItem {
  const minW = clamp(item.minW ?? 1, 1, cols)
  const minH = item.minH ?? 1
  const w = clamp(isFiniteNumber(item.w) ? item.w : minW, minW, cols)
  const h = Math.max(isFiniteNumber(item.h) ? item.h : minH, minH)
  const x = clamp(isFiniteNumber(item.x) ? item.x : 0, 0, Math.max(0, cols - w))
  const y = isFiniteNumber(item.y) && item.y >= 0 ? item.y : Number.POSITIVE_INFINITY

  return {
    ...item,
    x,
    y,
    w,
    h,
    minW,
    minH,
  }
}

function firstOpenPosition(items: LayoutItem[], candidate: LayoutItem, cols: number): Pick<LayoutItem, 'x' | 'y'> {
  for (let y = 0; y < 1000; y += 1) {
    for (let x = 0; x <= cols - candidate.w; x += 1) {
      const probe = { ...candidate, x, y }
      if (!items.some(item => overlaps(item, probe))) {
        return { x, y }
      }
    }
  }

  const bottomY = items.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0)
  return { x: 0, y: bottomY }
}

function placeItem(items: LayoutItem[], item: LayoutItem, cols: number): LayoutItem {
  const candidate = normalizeItem(item, cols)
  const requestedPositionIsUsable = Number.isFinite(candidate.y)
    && !items.some(existing => overlaps(existing, candidate))

  if (requestedPositionIsUsable) return candidate

  return {
    ...candidate,
    ...firstOpenPosition(items, candidate, cols),
  }
}

export function getLayoutBreakpoints(layouts: Record<string, LayoutItem[]>): string[] {
  const existing = Object.keys(layouts)
  return existing.length > 0 ? existing : [...DEFAULT_BREAKPOINTS]
}

export function addLayoutItemAcrossBreakpoints(
  layouts: Record<string, LayoutItem[]>,
  item: LayoutItem,
): Record<string, LayoutItem[]> {
  const nextLayouts = { ...layouts }

  for (const breakpoint of getLayoutBreakpoints(layouts)) {
    const items = nextLayouts[breakpoint] ?? []
    const cols = DEFAULT_COLS[breakpoint] ?? DEFAULT_COLS.lg
    nextLayouts[breakpoint] = [...items, placeItem(items, item, cols)]
  }

  return nextLayouts
}
