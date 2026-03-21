/**
 * Cross-cutting schema validation for all 11 module primitives (PRIM-12).
 * Ensures every primitive exports a valid configSchema with properly typed fields.
 */
import { describe, it, expect } from 'vitest'
import type { WidgetConfigSchema } from '@/lib/widget-registry'

import { configSchema as statCardSchema } from '../StatCard'
import { configSchema as progressGaugeSchema } from '../ProgressGauge'
import { configSchema as markdownDisplaySchema } from '../MarkdownDisplay'
import { configSchema as lineChartSchema } from '../LineChart'
import { configSchema as barChartSchema } from '../BarChart'
import { configSchema as listViewSchema } from '../ListView'
import { configSchema as dataTableSchema } from '../DataTable'
import { configSchema as formWidgetSchema } from '../FormWidget'
import { configSchema as kanbanBoardSchema } from '../KanbanBoard'
import { configSchema as timerCountdownSchema } from '../TimerCountdown'
import { configSchema as imageGallerySchema } from '../ImageGallery'

const VALID_TYPES = ['text', 'number', 'toggle', 'select', 'slider']

const primitives: Array<{ name: string; schema: WidgetConfigSchema }> = [
  { name: 'StatCard', schema: statCardSchema },
  { name: 'ProgressGauge', schema: progressGaugeSchema },
  { name: 'MarkdownDisplay', schema: markdownDisplaySchema },
  { name: 'LineChart', schema: lineChartSchema },
  { name: 'BarChart', schema: barChartSchema },
  { name: 'ListView', schema: listViewSchema },
  { name: 'DataTable', schema: dataTableSchema },
  { name: 'FormWidget', schema: formWidgetSchema },
  { name: 'KanbanBoard', schema: kanbanBoardSchema },
  { name: 'TimerCountdown', schema: timerCountdownSchema },
  { name: 'ImageGallery', schema: imageGallerySchema },
]

describe('Primitive Config Schemas (PRIM-12)', () => {
  describe.each(primitives)('$name', ({ schema }) => {
    it('exports a configSchema object', () => {
      expect(schema).toBeTruthy()
      expect(schema.fields).toBeDefined()
    })

    it('has non-empty fields array', () => {
      expect(schema.fields.length).toBeGreaterThan(0)
    })

    it('all fields have required properties', () => {
      for (const field of schema.fields) {
        expect(typeof field.key).toBe('string')
        expect(field.key.length).toBeGreaterThan(0)
        expect(typeof field.label).toBe('string')
        expect(field.label.length).toBeGreaterThan(0)
        expect(typeof field.type).toBe('string')
        expect(field.default).not.toBeUndefined()
      }
    })

    it('field types are valid', () => {
      for (const field of schema.fields) {
        expect(VALID_TYPES).toContain(field.type)
      }
    })

    it('select fields have options', () => {
      const selectFields = schema.fields.filter(f => f.type === 'select')
      for (const field of selectFields) {
        expect(field.options).toBeDefined()
        expect(field.options!.length).toBeGreaterThan(0)
      }
    })

    it('no duplicate field keys', () => {
      const keys = schema.fields.map(f => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })
})
