/**
 * StatCard primitive -- displays a metric with title, value, trend arrow,
 * and optional SVG sparkline from config data.
 *
 * Config keys: title (string), value (string), unit (string),
 *              trend ("up"|"down"|"flat"), color (semantic key), data (number[])
 */

import React, { useMemo } from 'react'
import { ArrowUp, ArrowDown, Minus, ChartLineUp } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { EmptyState } from '@/components/ui/EmptyState'
import { configString, configArray, resolveColor } from './shared'

// ---------------------------------------------------------------------------
// Config schema (co-exported for widget registration)
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Metric' },
    { key: 'value', label: 'Value', type: 'text', default: '0' },
    { key: 'unit', label: 'Unit', type: 'text', default: '' },
    {
      key: 'trend',
      label: 'Trend',
      type: 'select',
      default: 'flat',
      options: [
        { label: 'Up', value: 'up' },
        { label: 'Down', value: 'down' },
        { label: 'Flat', value: 'flat' },
      ],
    },
    {
      key: 'color',
      label: 'Color',
      type: 'select',
      default: 'accent',
      options: [
        { label: 'Accent', value: 'accent' },
        { label: 'Secondary', value: 'secondary' },
        { label: 'Tertiary', value: 'tertiary' },
        { label: 'Red', value: 'red' },
        { label: 'Amber', value: 'amber' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Sparkline helper
// ---------------------------------------------------------------------------

function buildPolyline(data: number[], width: number, height: number): string {
  if (data.length < 2) return ''
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)

  return data
    .map((v, i) => {
      const x = i * step
      // Invert y so higher values are at the top
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')
}

// ---------------------------------------------------------------------------
// Trend icon
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: string }) {
  switch (trend) {
    case 'up':
      return (
        <ArrowUp
          size={16}
          weight="bold"
          aria-label="Trending up"
          style={{ color: 'var(--secondary)' }}
        />
      )
    case 'down':
      return (
        <ArrowDown
          size={16}
          weight="bold"
          aria-label="Trending down"
          style={{ color: 'var(--red)' }}
        />
      )
    default:
      return (
        <Minus
          size={16}
          weight="bold"
          aria-label="No change"
          style={{ color: 'var(--text-muted)' }}
        />
      )
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const StatCard = React.memo(function StatCard({ config }: WidgetProps) {
  const title = configString(config, 'title', 'Metric')
  const value = configString(config, 'value', '')
  const unit = configString(config, 'unit', '')
  const trend = configString(config, 'trend', '')
  const colorKey = configString(config, 'color', 'accent')
  const data = configArray<number>(config, 'data')

  const sparkColor = resolveColor(colorKey)

  const polyline = useMemo(
    () => buildPolyline(data, 200, 40),
    [data],
  )

  // Empty state: no value and no data
  if (!value && data.length < 2) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <EmptyState icon={ChartLineUp} title="No data" description="Configure a value or data series" />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '12px 16px',
        gap: '4px',
      }}
    >
      {/* Title */}
      <span
        style={{
          fontSize: '14px',
          color: 'var(--text-muted)',
          lineHeight: 1.2,
        }}
      >
        {title}
      </span>

      {/* Value */}
      {value && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span
            style={{
              fontSize: '32px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.1,
            }}
          >
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {unit}
            </span>
          )}
        </div>
      )}

      {/* Trend */}
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TrendIcon trend={trend} />
        </div>
      )}

      {/* Sparkline */}
      {polyline && (
        <svg
          className="stat-sparkline"
          viewBox="0 0 200 40"
          preserveAspectRatio="none"
          style={{
            width: '100%',
            height: '40px',
            marginTop: 'auto',
          }}
        >
          <polyline
            points={polyline}
            fill="none"
            stroke={sparkColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
})

export default StatCard
