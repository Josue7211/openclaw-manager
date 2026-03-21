import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LineChart, { configSchema } from '../LineChart'

const baseProps = {
  widgetId: 'test-line-1',
  config: {
    data: [10, 20, 30, 40, 50],
    title: 'Test Chart',
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    lineColor: 'accent',
    showGrid: true,
    showDots: false,
  },
  isEditMode: false,
  size: { w: 4, h: 3 },
}

describe('LineChart', () => {
  it('renders SVG element with polyline when data provided', () => {
    const { container } = render(<LineChart {...baseProps} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const polyline = container.querySelector('polyline')
    expect(polyline).toBeTruthy()
  })

  it('shows EmptyState when data is empty array', () => {
    render(
      <LineChart
        {...baseProps}
        config={{ ...baseProps.config, data: [] }}
      />,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('No data')).toBeTruthy()
  })

  it('shows EmptyState when data has fewer than 2 points', () => {
    render(
      <LineChart
        {...baseProps}
        config={{ ...baseProps.config, data: [5] }}
      />,
    )
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('renders grid lines when showGrid is true', () => {
    const { container } = render(<LineChart {...baseProps} />)
    const gridLines = container.querySelectorAll('line[data-grid]')
    expect(gridLines.length).toBeGreaterThan(0)
  })

  it('does not render grid lines when showGrid is false', () => {
    const { container } = render(
      <LineChart
        {...baseProps}
        config={{ ...baseProps.config, showGrid: false }}
      />,
    )
    const gridLines = container.querySelectorAll('line[data-grid]')
    expect(gridLines.length).toBe(0)
  })

  it('renders dot circles when showDots is true', () => {
    const { container } = render(
      <LineChart
        {...baseProps}
        config={{ ...baseProps.config, showDots: true }}
      />,
    )
    const dots = container.querySelectorAll('circle[data-dot]')
    expect(dots.length).toBe(5)
  })

  it('does not render dot circles when showDots is false', () => {
    const { container } = render(<LineChart {...baseProps} />)
    const dots = container.querySelectorAll('circle[data-dot]')
    expect(dots.length).toBe(0)
  })

  it('renders title text', () => {
    const { container } = render(<LineChart {...baseProps} />)
    const title = container.querySelector('text[data-title]')
    expect(title).toBeTruthy()
    expect(title!.textContent).toBe('Test Chart')
  })

  it('exports a configSchema with expected fields', () => {
    expect(configSchema).toBeDefined()
    expect(configSchema.fields).toBeInstanceOf(Array)
    const keys = configSchema.fields.map((f) => f.key)
    expect(keys).toContain('title')
    expect(keys).toContain('lineColor')
    expect(keys).toContain('showGrid')
    expect(keys).toContain('showDots')
  })
})
