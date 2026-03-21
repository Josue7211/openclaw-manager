/**
 * Widget Registry integration test for all 11 module primitives (PRIM-13).
 * Verifies every primitive is registered, resolvable, and widget-compatible.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { getWidget, getWidgetsByCategory } from '@/lib/widget-registry'
import { registerPrimitives } from '../register'

const PRIMITIVE_IDS = [
  'prim-stat-card',
  'prim-progress-gauge',
  'prim-markdown',
  'prim-line-chart',
  'prim-bar-chart',
  'prim-list-view',
  'prim-data-table',
  'prim-form',
  'prim-kanban',
  'prim-timer',
  'prim-image-gallery',
]

describe('Primitive Widget Registration (PRIM-13)', () => {
  beforeAll(() => {
    registerPrimitives()
  })

  describe.each(PRIMITIVE_IDS.map(id => ({ id })))('$id', ({ id }) => {
    it('is registered in Widget Registry', () => {
      expect(getWidget(id)).toBeDefined()
    })

    it("has category 'primitives'", () => {
      expect(getWidget(id)!.category).toBe('primitives')
    })

    it('has a component loader function', () => {
      expect(typeof getWidget(id)!.component).toBe('function')
    })

    it('has valid defaultSize', () => {
      const { defaultSize } = getWidget(id)!
      expect(defaultSize.w).toBeGreaterThan(0)
      expect(defaultSize.h).toBeGreaterThan(0)
    })

    it('has valid minSize', () => {
      const { minSize } = getWidget(id)!
      expect(minSize).toBeDefined()
      expect(minSize!.w).toBeGreaterThan(0)
      expect(minSize!.h).toBeGreaterThan(0)
    })
  })

  it('getWidgetsByCategory includes all 11 primitives', () => {
    const byCategory = getWidgetsByCategory()
    expect(byCategory['primitives']).toBeDefined()
    expect(byCategory['primitives'].length).toBe(11)
  })
})
