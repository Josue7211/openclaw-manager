/**
 * Error handling tests for all 11 module primitives (PRIM-14).
 * Verifies every primitive handles empty/malformed config gracefully.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { WidgetProps } from '@/lib/widget-registry'

// Mock Lightbox for ImageGallery
vi.mock('@/components/Lightbox', () => ({
  __esModule: true,
  default: () => null,
}))

import StatCard from '../StatCard'
import ProgressGauge from '../ProgressGauge'
import MarkdownDisplay from '../MarkdownDisplay'
import LineChart from '../LineChart'
import BarChart from '../BarChart'
import ListView from '../ListView'
import DataTable from '../DataTable'
import FormWidget from '../FormWidget'
import KanbanBoard from '../KanbanBoard'
import TimerCountdown from '../TimerCountdown'
import ImageGallery from '../ImageGallery'

const baseProps: Omit<WidgetProps, 'config'> = {
  widgetId: 'test-error',
  isEditMode: false,
  size: { w: 4, h: 3 },
}

const malformedConfig = {
  data: 'not an array',
  value: {},
  title: 42,
  items: 'nope',
  columns: 'wrong',
  fields: 'broken',
  images: 123,
  duration: 'abc',
}

const primitives: Array<{ name: string; Component: React.ComponentType<WidgetProps> }> = [
  { name: 'StatCard', Component: StatCard },
  { name: 'ProgressGauge', Component: ProgressGauge },
  { name: 'MarkdownDisplay', Component: MarkdownDisplay },
  { name: 'LineChart', Component: LineChart },
  { name: 'BarChart', Component: BarChart },
  { name: 'ListView', Component: ListView },
  { name: 'DataTable', Component: DataTable },
  { name: 'FormWidget', Component: FormWidget },
  { name: 'KanbanBoard', Component: KanbanBoard },
  { name: 'TimerCountdown', Component: TimerCountdown },
  { name: 'ImageGallery', Component: ImageGallery },
]

describe('Primitive Error Handling (PRIM-14)', () => {
  describe.each(primitives)('$name', ({ Component }) => {
    it('renders without throwing on empty config', () => {
      expect(() => {
        render(<Component {...baseProps} config={{}} />)
      }).not.toThrow()
    })

    it('renders without throwing on malformed config', () => {
      expect(() => {
        render(<Component {...baseProps} config={malformedConfig} />)
      }).not.toThrow()
    })

    it('does not render blank on empty config', () => {
      const { container } = render(<Component {...baseProps} config={{}} />)
      // Should have some content — not just an empty wrapper
      expect(container.innerHTML.length).toBeGreaterThan(10)
    })

    it('shows fallback UI on empty config', () => {
      const { container } = render(<Component {...baseProps} config={{}} />)
      // Should contain EmptyState (role="status") or at minimum visible text
      const hasStatus = container.querySelector('[role="status"]')
      const hasText = container.textContent && container.textContent.length > 0
      expect(hasStatus || hasText).toBeTruthy()
    })
  })
})
