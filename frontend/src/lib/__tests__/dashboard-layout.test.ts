import { describe, expect, it } from 'vitest'
import { addLayoutItemAcrossBreakpoints } from '../dashboard-layout'
import type { LayoutItem } from '../dashboard-store'

describe('addLayoutItemAcrossBreakpoints', () => {
  it('creates responsive breakpoint layouts for an empty page', () => {
    const item: LayoutItem = { i: 'missions-1', x: 0, y: Infinity, w: 4, h: 2 }
    const layouts = addLayoutItemAcrossBreakpoints({}, item)

    expect(Object.keys(layouts).sort()).toEqual(['lg', 'md', 'sm', 'xl'])
    expect(layouts.lg[0]).toMatchObject({ i: 'missions-1', x: 0, y: 0, w: 4, h: 2 })
    expect(layouts.sm[0]).toMatchObject({ i: 'missions-1', x: 0, y: 0, w: 4, h: 2 })
  })

  it('places new widgets in the first open slot instead of storing Infinity', () => {
    const layouts = addLayoutItemAcrossBreakpoints(
      {
        lg: [{ i: 'existing', x: 0, y: 0, w: 4, h: 2 }],
      },
      { i: 'next', x: 0, y: Infinity, w: 4, h: 2 },
    )

    expect(layouts.lg[1]).toMatchObject({ i: 'next', x: 4, y: 0, w: 4, h: 2 })
    expect(Number.isFinite(layouts.lg[1].y)).toBe(true)
  })

  it('falls back to the first open slot when a requested position collides', () => {
    const layouts = addLayoutItemAcrossBreakpoints(
      {
        sm: [{ i: 'existing', x: 0, y: 0, w: 4, h: 2 }],
      },
      { i: 'next', x: 0, y: 0, w: 4, h: 2 },
    )

    expect(layouts.sm[1]).toMatchObject({ i: 'next', x: 0, y: 2, w: 4, h: 2 })
  })

  it('clamps widgets to the active breakpoint width', () => {
    const layouts = addLayoutItemAcrossBreakpoints(
      {
        sm: [],
      },
      { i: 'wide', x: 10, y: Infinity, w: 8, h: 2, minW: 1 },
    )

    expect(layouts.sm[0]).toMatchObject({ i: 'wide', x: 0, y: 0, w: 4 })
  })
})
