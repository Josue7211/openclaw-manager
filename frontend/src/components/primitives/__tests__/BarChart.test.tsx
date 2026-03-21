import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BarChart, { configSchema } from '../BarChart'

const baseProps = {
  widgetId: 'test-bar-1',
  config: {
    data: [30, 50, 20, 40],
    title: 'Test Bar Chart',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    barColor: 'accent',
    orientation: 'vertical',
    stacked: false,
  },
  isEditMode: false,
  size: { w: 4, h: 3 },
}

describe('BarChart', () => {
  it('renders SVG rect elements for single-series data', () => {
    const { container } = render(<BarChart {...baseProps} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const rects = container.querySelectorAll('rect[data-bar]')
    expect(rects.length).toBe(4)
  })

  it('shows EmptyState when data is empty', () => {
    render(
      <BarChart
        {...baseProps}
        config={{ ...baseProps.config, data: [] }}
      />,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('No data')).toBeTruthy()
  })

  it('renders vertical bars that grow upward', () => {
    const { container } = render(<BarChart {...baseProps} />)
    const rects = container.querySelectorAll('rect[data-bar]')
    // All bars should have positive height
    rects.forEach((rect) => {
      const height = parseFloat(rect.getAttribute('height') || '0')
      expect(height).toBeGreaterThan(0)
    })
    // The tallest bar (value 50, index 1) should have greater height than smallest (value 20, index 2)
    const rect1Height = parseFloat(rects[1].getAttribute('height') || '0')
    const rect2Height = parseFloat(rects[2].getAttribute('height') || '0')
    expect(rect1Height).toBeGreaterThan(rect2Height)
  })

  it('renders horizontal bars that grow rightward', () => {
    const { container } = render(
      <BarChart
        {...baseProps}
        config={{ ...baseProps.config, orientation: 'horizontal' }}
      />,
    )
    const rects = container.querySelectorAll('rect[data-bar]')
    expect(rects.length).toBe(4)
    // Horizontal bars should have positive width and start from left
    rects.forEach((rect) => {
      const width = parseFloat(rect.getAttribute('width') || '0')
      expect(width).toBeGreaterThan(0)
    })
    // The widest bar (value 50) should be wider than the narrowest (value 20)
    const rect1Width = parseFloat(rects[1].getAttribute('width') || '0')
    const rect2Width = parseFloat(rects[2].getAttribute('width') || '0')
    expect(rect1Width).toBeGreaterThan(rect2Width)
  })

  it('renders multiple bars per category for multi-series data', () => {
    const { container } = render(
      <BarChart
        {...baseProps}
        config={{
          ...baseProps.config,
          data: [[10, 20, 30], [15, 25, 35]],
          labels: ['A', 'B', 'C'],
        }}
      />,
    )
    const rects = container.querySelectorAll('rect[data-bar]')
    // 3 categories x 2 series = 6 bars
    expect(rects.length).toBe(6)
  })

  it('renders title text', () => {
    const { container } = render(<BarChart {...baseProps} />)
    const title = container.querySelector('text[data-title]')
    expect(title).toBeTruthy()
    expect(title!.textContent).toBe('Test Bar Chart')
  })

  it('exports a configSchema with expected fields', () => {
    expect(configSchema).toBeDefined()
    expect(configSchema.fields).toBeInstanceOf(Array)
    const keys = configSchema.fields.map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('orientation')
    expect(keys).toContain('stacked')
    expect(keys).toContain('barColor')
  })
})
