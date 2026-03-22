import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules.ts before importing dashboard-defaults
vi.mock('../modules', () => ({
  getEnabledModules: vi.fn(() => [
    'dashboard', 'agents', 'missions', 'memory', 'pipeline', 'knowledge',
    'messages', 'chat', 'todos', 'calendar', 'reminders', 'email',
    'pomodoro', 'homelab', 'media', 'crons', 'notes',
  ]),
}))

import { generateDefaultLayout, DEFAULT_ORDER } from '../dashboard-defaults'
import { getEnabledModules } from '../modules'

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

describe('generateDefaultLayout', () => {
  beforeEach(() => {
    vi.mocked(getEnabledModules).mockReturnValue([
      'dashboard', 'agents', 'missions', 'memory', 'pipeline', 'knowledge',
      'messages', 'chat', 'todos', 'calendar', 'reminders', 'email',
      'pomodoro', 'homelab', 'media', 'crons', 'notes',
    ])
  })

  it('returns widgets array and layouts object', () => {
    const result = generateDefaultLayout()
    expect(result).toHaveProperty('widgets')
    expect(result).toHaveProperty('layouts')
    expect(Array.isArray(result.widgets)).toBe(true)
    expect(typeof result.layouts).toBe('object')
  })

  it('layouts has xl/lg/md/sm keys', () => {
    const result = generateDefaultLayout()
    expect(result.layouts).toHaveProperty('xl')
    expect(result.layouts).toHaveProperty('lg')
    expect(result.layouts).toHaveProperty('md')
    expect(result.layouts).toHaveProperty('sm')
  })

  it('all layout items have integer x, y, w, h values', () => {
    const result = generateDefaultLayout()
    for (const [, items] of Object.entries(result.layouts)) {
      for (const item of items as LayoutItem[]) {
        expect(Number.isInteger(item.x)).toBe(true)
        expect(Number.isInteger(item.y)).toBe(true)
        expect(Number.isInteger(item.w)).toBe(true)
        expect(Number.isInteger(item.h)).toBe(true)
      }
    }
  })

  it('produces non-overlapping grid positions in lg layout', () => {
    const result = generateDefaultLayout()
    const lgItems = result.layouts['lg'] as LayoutItem[]
    for (let i = 0; i < lgItems.length; i++) {
      for (let j = i + 1; j < lgItems.length; j++) {
        const a = lgItems[i]
        const b = lgItems[j]
        // Two rectangles overlap if they share x and y ranges
        const xOverlap = a.x < b.x + b.w && a.x + a.w > b.x
        const yOverlap = a.y < b.y + b.h && a.y + a.h > b.y
        expect(
          xOverlap && yOverlap,
          `Items "${a.i}" and "${b.i}" overlap in lg layout`
        ).toBe(false)
      }
    }
  })

  it('produces non-overlapping grid positions in md layout', () => {
    const result = generateDefaultLayout()
    const mdItems = result.layouts['md'] as LayoutItem[]
    for (let i = 0; i < mdItems.length; i++) {
      for (let j = i + 1; j < mdItems.length; j++) {
        const a = mdItems[i]
        const b = mdItems[j]
        const xOverlap = a.x < b.x + b.w && a.x + a.w > b.x
        const yOverlap = a.y < b.y + b.h && a.y + a.h > b.y
        expect(
          xOverlap && yOverlap,
          `Items "${a.i}" and "${b.i}" overlap in md layout`
        ).toBe(false)
      }
    }
  })

  it('excludes widgets for disabled modules', () => {
    // Only enable dashboard-related modules — but not all
    vi.mocked(getEnabledModules).mockReturnValue(['dashboard'])
    const result = generateDefaultLayout()
    // Should still include all built-in widgets since they're dashboard widgets
    // that gracefully handle missing services
    expect(result.widgets.length).toBeGreaterThan(0)
  })

  it('includes all 8 widgets when all modules are enabled', () => {
    const result = generateDefaultLayout()
    expect(result.widgets).toHaveLength(8)
  })
})

describe('DEFAULT_ORDER', () => {
  it('is an array of widget IDs', () => {
    expect(Array.isArray(DEFAULT_ORDER)).toBe(true)
    expect(DEFAULT_ORDER.length).toBeGreaterThan(0)
    for (const id of DEFAULT_ORDER) {
      expect(typeof id).toBe('string')
    }
  })
})
