import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}))

import ProgressGauge from '../ProgressGauge'

const baseProps = {
  widgetId: 'test-gauge',
  isEditMode: false,
  size: { w: 3, h: 2 },
}

describe('ProgressGauge', () => {
  describe('bar variant (default)', () => {
    it('renders progress bar with correct width percentage', () => {
      render(<ProgressGauge {...baseProps} config={{ value: 75, max: 100 }} />)
      const bar = document.querySelector('.gauge-bar-fill') as HTMLElement
      expect(bar).toBeInTheDocument()
      expect(bar.style.width).toBe('75%')
    })

    it('renders percentage label', () => {
      render(<ProgressGauge {...baseProps} config={{ value: 75, max: 100 }} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('renders label when provided', () => {
      render(
        <ProgressGauge
          {...baseProps}
          config={{ value: 50, max: 100, label: 'Disk Usage' }}
        />,
      )
      expect(screen.getByText('Disk Usage')).toBeInTheDocument()
    })

    it('clamps value at max (no overflow)', () => {
      render(
        <ProgressGauge {...baseProps} config={{ value: 150, max: 100 }} />,
      )
      const bar = document.querySelector('.gauge-bar-fill') as HTMLElement
      expect(bar.style.width).toBe('100%')
      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('clamps negative value to 0', () => {
      render(
        <ProgressGauge {...baseProps} config={{ value: -10, max: 100 }} />,
      )
      const bar = document.querySelector('.gauge-bar-fill') as HTMLElement
      expect(bar.style.width).toBe('0%')
      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('uses default max of 100 when not provided', () => {
      render(<ProgressGauge {...baseProps} config={{ value: 25 }} />)
      expect(screen.getByText('25%')).toBeInTheDocument()
    })
  })

  describe('circular variant', () => {
    it('renders SVG circle gauge', () => {
      render(
        <ProgressGauge
          {...baseProps}
          config={{ value: 50, max: 100, variant: 'circular' }}
        />,
      )
      const svg = document.querySelector('svg.gauge-circular')
      expect(svg).toBeInTheDocument()
      // Background and foreground circles
      const circles = svg?.querySelectorAll('circle')
      expect(circles?.length).toBe(2)
    })

    it('renders percentage label in center', () => {
      render(
        <ProgressGauge
          {...baseProps}
          config={{ value: 60, max: 100, variant: 'circular' }}
        />,
      )
      expect(screen.getByText('60%')).toBeInTheDocument()
    })
  })

  it('defaults to bar variant when variant not set', () => {
    render(<ProgressGauge {...baseProps} config={{ value: 50 }} />)
    expect(document.querySelector('.gauge-bar-fill')).toBeInTheDocument()
    expect(document.querySelector('svg.gauge-circular')).not.toBeInTheDocument()
  })

  it('exports configSchema with expected fields', async () => {
    const mod = await import('../ProgressGauge')
    expect(mod.configSchema).toBeDefined()
    expect(mod.configSchema.fields).toHaveLength(5)
    const keys = mod.configSchema.fields.map((f: any) => f.key)
    expect(keys).toEqual(['label', 'value', 'max', 'variant', 'color'])
  })
})
