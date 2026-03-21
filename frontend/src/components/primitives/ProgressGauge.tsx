/**
 * ProgressGauge primitive -- renders a linear progress bar or circular SVG gauge.
 *
 * Config keys: label (string), value (number), max (number),
 *              variant ("bar"|"circular"), color (semantic key)
 */

import React from 'react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { configString, configNumber, resolveColor } from './shared'

// ---------------------------------------------------------------------------
// Config schema (co-exported for widget registration)
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'label', label: 'Label', type: 'text', default: '' },
    { key: 'value', label: 'Value', type: 'number', default: 0, min: 0 },
    { key: 'max', label: 'Max', type: 'number', default: 100, min: 1 },
    {
      key: 'variant',
      label: 'Variant',
      type: 'select',
      default: 'bar',
      options: [
        { label: 'Bar', value: 'bar' },
        { label: 'Circular', value: 'circular' },
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
// Component
// ---------------------------------------------------------------------------

const ProgressGauge = React.memo(function ProgressGauge({ config }: WidgetProps) {
  const label = configString(config, 'label', '')
  const rawValue = configNumber(config, 'value', 0)
  const max = configNumber(config, 'max', 100)
  const variant = configString(config, 'variant', 'bar')
  const colorKey = configString(config, 'color', 'accent')

  // Clamp value between 0 and max
  const value = Math.max(0, Math.min(rawValue, max))
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  const color = resolveColor(colorKey)

  if (variant === 'circular') {
    return <CircularGauge label={label} percent={percent} color={color} />
  }

  return <BarGauge label={label} percent={percent} color={color} />
})

// ---------------------------------------------------------------------------
// Bar variant
// ---------------------------------------------------------------------------

function BarGauge({
  label,
  percent,
  color,
}: {
  label: string
  percent: number
  color: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 16px',
        height: '100%',
        justifyContent: 'center',
      }}
    >
      {label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
            {label}
          </span>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {percent}%
          </span>
        </div>
      )}
      {!label && (
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {percent}%
          </span>
        </div>
      )}
      <div
        style={{
          background: 'var(--bg-base)',
          borderRadius: 'var(--radius-sm, 4px)',
          height: '12px',
          overflow: 'hidden',
        }}
      >
        <div
          className="gauge-bar-fill"
          style={{
            width: `${percent}%`,
            height: '100%',
            background: color,
            borderRadius: 'var(--radius-sm, 4px)',
            transition: 'width 0.3s var(--ease-spring, ease-out)',
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Circular variant
// ---------------------------------------------------------------------------

function CircularGauge({
  label,
  percent,
  color,
}: {
  label: string
  percent: number
  color: string
}) {
  const size = 100
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '12px 16px',
        gap: '8px',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          className="gauge-circular"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          {/* Foreground circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        {/* Centered label */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {percent}%
        </div>
      </div>
      {label && (
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {label}
        </span>
      )}
    </div>
  )
}

export default ProgressGauge
