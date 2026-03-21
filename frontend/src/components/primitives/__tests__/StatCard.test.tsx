import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock EmptyState to simplify assertions
vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}))

import StatCard from '../StatCard'

const baseProps = {
  widgetId: 'test-stat',
  isEditMode: false,
  size: { w: 3, h: 2 },
}

describe('StatCard', () => {
  it('renders title from config', () => {
    render(<StatCard {...baseProps} config={{ title: 'CPU Usage', value: '42' }} />)
    expect(screen.getByText('CPU Usage')).toBeInTheDocument()
  })

  it('renders default title when not provided', () => {
    render(<StatCard {...baseProps} config={{ value: '10' }} />)
    expect(screen.getByText('Metric')).toBeInTheDocument()
  })

  it('renders formatted value from config', () => {
    render(<StatCard {...baseProps} config={{ value: '1,234' }} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders unit suffix when provided', () => {
    render(<StatCard {...baseProps} config={{ value: '42', unit: 'ms' }} />)
    expect(screen.getByText('ms')).toBeInTheDocument()
  })

  it('renders up trend arrow', () => {
    render(
      <StatCard {...baseProps} config={{ value: '10', trend: 'up' }} />,
    )
    expect(screen.getByLabelText('Trending up')).toBeInTheDocument()
  })

  it('renders down trend arrow', () => {
    render(
      <StatCard {...baseProps} config={{ value: '10', trend: 'down' }} />,
    )
    expect(screen.getByLabelText('Trending down')).toBeInTheDocument()
  })

  it('renders flat trend indicator', () => {
    render(
      <StatCard {...baseProps} config={{ value: '10', trend: 'flat' }} />,
    )
    expect(screen.getByLabelText('No change')).toBeInTheDocument()
  })

  it('renders sparkline SVG when data provided', () => {
    render(
      <StatCard
        {...baseProps}
        config={{ value: '10', data: [1, 2, 3, 4, 5] }}
      />,
    )
    const svg = document.querySelector('svg.stat-sparkline')
    expect(svg).toBeInTheDocument()
    const polyline = svg?.querySelector('polyline')
    expect(polyline).toBeInTheDocument()
  })

  it('does not render sparkline with fewer than 2 data points', () => {
    render(
      <StatCard {...baseProps} config={{ value: '10', data: [1] }} />,
    )
    expect(document.querySelector('svg.stat-sparkline')).not.toBeInTheDocument()
  })

  it('shows EmptyState when no value and no data', () => {
    render(<StatCard {...baseProps} config={{}} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('does not show EmptyState when value is provided', () => {
    render(<StatCard {...baseProps} config={{ value: '0' }} />)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  it('exports configSchema with expected fields', async () => {
    const mod = await import('../StatCard')
    expect(mod.configSchema).toBeDefined()
    expect(mod.configSchema.fields).toHaveLength(5)
    const keys = mod.configSchema.fields.map((f: any) => f.key)
    expect(keys).toEqual(['title', 'value', 'unit', 'trend', 'color'])
  })
})
