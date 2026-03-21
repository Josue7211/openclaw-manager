/**
 * LineChart primitive -- renders an SVG polyline from numeric data.
 *
 * Custom SVG (no charting library) so markup is transparent to Bjorn
 * for AI-generated module composition. Colors resolve through CSS variables.
 */

import React, { useState, useCallback, useRef } from 'react'
import { ChartLine } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  configString,
  configBool,
  configArray,
  resolveColor,
} from './shared'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Line Chart' },
    {
      key: 'lineColor',
      label: 'Line Color',
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
    { key: 'showGrid', label: 'Show Grid', type: 'toggle', default: true },
    { key: 'showDots', label: 'Show Dots', type: 'toggle', default: false },
  ],
}

// ---------------------------------------------------------------------------
// Layout constants (inside a 400x200 viewBox)
// ---------------------------------------------------------------------------

const VB_W = 400
const VB_H = 200
const PAD_LEFT = 40
const PAD_RIGHT = 8
const PAD_TOP = 24
const PAD_BOTTOM = 24

const CHART_W = VB_W - PAD_LEFT - PAD_RIGHT
const CHART_H = VB_H - PAD_TOP - PAD_BOTTOM

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTicks(min: number, max: number): number[] {
  if (min === max) return [min]
  const range = max - min
  const roughStep = range / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude
  let niceStep: number
  if (residual <= 1.5) niceStep = magnitude
  else if (residual <= 3) niceStep = 2 * magnitude
  else if (residual <= 7) niceStep = 5 * magnitude
  else niceStep = 10 * magnitude

  const ticks: number[] = []
  const start = Math.floor(min / niceStep) * niceStep
  for (let t = start; t <= max + niceStep * 0.01; t += niceStep) {
    ticks.push(Math.round(t * 1e6) / 1e6)
  }
  if (ticks.length < 2) {
    ticks.unshift(min)
    ticks.push(max)
  }
  return ticks
}

function formatTick(val: number): string {
  if (Number.isInteger(val)) return String(val)
  return val.toFixed(1)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LineChart = React.memo(function LineChart({
  config,
}: WidgetProps) {
  const data = configArray<number>(config, 'data')
  const title = configString(config, 'title', 'Line Chart')
  const labels = configArray<string>(config, 'labels')
  const lineColor = configString(config, 'lineColor', 'accent')
  const showGrid = configBool(config, 'showGrid', true)
  const showDots = configBool(config, 'showDots', false)

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const validData = data.filter((v) => typeof v === 'number' && Number.isFinite(v))

  if (validData.length < 2) {
    return <EmptyState icon={ChartLine} title="No data" description="Provide at least 2 data points" />
  }

  const minVal = Math.min(...validData)
  const maxVal = Math.max(...validData)
  const ticks = computeTicks(minVal, maxVal)
  const tickMin = Math.min(ticks[0], minVal)
  const tickMax = Math.max(ticks[ticks.length - 1], maxVal)
  const tickRange = tickMax === tickMin ? 1 : tickMax - tickMin

  const points = validData.map((val, i) => {
    const x = PAD_LEFT + (i / (validData.length - 1)) * CHART_W
    const y = PAD_TOP + (1 - (val - tickMin) / tickRange) * CHART_H
    return { x, y, val }
  })

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ')
  const color = resolveColor(lineColor)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget
      const rect = svg.getBoundingClientRect()
      const mouseX = ((e.clientX - rect.left) / rect.width) * VB_W
      let closest = 0
      let closestDist = Infinity
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - mouseX)
        if (dist < closestDist) {
          closestDist = dist
          closest = i
        }
      }
      setHoveredIdx(closest)
    },
    [points],
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      >
        <text
          data-title=""
          x={VB_W / 2}
          y={14}
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize="12"
          fontWeight="600"
        >
          {title}
        </text>

        {showGrid &&
          ticks.map((tick) => {
            const y = PAD_TOP + (1 - (tick - tickMin) / tickRange) * CHART_H
            return (
              <line
                key={`grid-${tick}`}
                data-grid=""
                x1={PAD_LEFT}
                y1={y}
                x2={VB_W - PAD_RIGHT}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="4 4"
                opacity={0.5}
              />
            )
          })}

        {ticks.map((tick) => {
          const y = PAD_TOP + (1 - (tick - tickMin) / tickRange) * CHART_H
          return (
            <text
              key={`y-${tick}`}
              x={PAD_LEFT - 4}
              y={y + 3}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="9"
            >
              {formatTick(tick)}
            </text>
          )
        })}

        {points.map((p, i) => {
          const label = labels[i] ?? String(i + 1)
          const maxLabels = 10
          if (validData.length > maxLabels && i % Math.ceil(validData.length / maxLabels) !== 0 && i !== validData.length - 1) {
            return null
          }
          return (
            <text
              key={`x-${i}`}
              x={p.x}
              y={VB_H - 4}
              textAnchor="middle"
              fill="var(--text-muted)"
              fontSize="9"
            >
              {label}
            </text>
          )
        })}

        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showDots &&
          points.map((p, i) => (
            <circle
              key={`dot-${i}`}
              data-dot=""
              cx={p.x}
              cy={p.y}
              r={3}
              fill={color}
            />
          ))}

        {hoveredIdx !== null && points[hoveredIdx] && (
          <circle
            cx={points[hoveredIdx].x}
            cy={points[hoveredIdx].y}
            r={4}
            fill={color}
            stroke="var(--bg-card-solid)"
            strokeWidth={2}
          />
        )}
      </svg>

      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            left: `${(points[hoveredIdx].x / VB_W) * 100}%`,
            top: `${(points[hoveredIdx].y / VB_H) * 100}%`,
            transform: 'translate(-50%, -120%)',
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {labels[hoveredIdx] ? `${labels[hoveredIdx]}: ` : ''}
          {points[hoveredIdx].val}
        </div>
      )}
    </div>
  )
})

export default LineChart
