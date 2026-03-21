/**
 * BarChart primitive -- renders SVG rect elements for vertical/horizontal bars.
 *
 * Supports single-series (number[]) and multi-series (number[][]) data,
 * with grouped or stacked display modes. Custom SVG keeps markup transparent
 * to Bjorn for AI-generated module composition.
 */

import React, { useState, useCallback } from 'react'
import { ChartBar } from '@phosphor-icons/react'
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
    { key: 'title', label: 'Title', type: 'text', default: 'Bar Chart' },
    {
      key: 'orientation',
      label: 'Orientation',
      type: 'select',
      default: 'vertical',
      options: [
        { label: 'Vertical', value: 'vertical' },
        { label: 'Horizontal', value: 'horizontal' },
      ],
    },
    { key: 'stacked', label: 'Stacked', type: 'toggle', default: false },
    {
      key: 'barColor',
      label: 'Bar Color',
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

const DEFAULT_COLORS = ['accent', 'secondary', 'tertiary']

function computeTicks(min: number, max: number): number[] {
  if (max === 0 && min === 0) return [0]
  const range = max - min || 1
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

/** Normalize data to always be number[][] (multi-series). */
function normalizeData(raw: unknown[]): number[][] {
  if (raw.length === 0) return []
  if (Array.isArray(raw[0])) {
    return raw as number[][]
  }
  return [raw as number[]]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BarChart = React.memo(function BarChart({
  config,
}: WidgetProps) {
  const rawData = configArray<unknown>(config, 'data')
  const title = configString(config, 'title', 'Bar Chart')
  const labels = configArray<string>(config, 'labels')
  const orientation = configString(config, 'orientation', 'vertical')
  const stacked = configBool(config, 'stacked', false)
  const barColor = configString(config, 'barColor', 'accent')
  const colors = configArray<string>(config, 'colors')

  const [hoveredBar, setHoveredBar] = useState<{ seriesIdx: number; catIdx: number } | null>(null)

  const series = normalizeData(rawData)
  if (series.length === 0 || series[0].length === 0) {
    return <EmptyState icon={ChartBar} title="No data" description="Provide data to display" />
  }

  const numCategories = series[0].length
  const numSeries = series.length
  const isVertical = orientation === 'vertical'

  // Compute max value for scaling
  let maxVal: number
  if (stacked && numSeries > 1) {
    // For stacked, max is the sum of all series at each category
    maxVal = 0
    for (let c = 0; c < numCategories; c++) {
      let sum = 0
      for (let s = 0; s < numSeries; s++) {
        sum += series[s][c] ?? 0
      }
      maxVal = Math.max(maxVal, sum)
    }
  } else {
    maxVal = 0
    for (const s of series) {
      for (const v of s) {
        maxVal = Math.max(maxVal, v)
      }
    }
  }
  if (maxVal === 0) maxVal = 1

  const ticks = computeTicks(0, maxVal)
  const tickMax = ticks[ticks.length - 1]

  // Resolve colors for each series
  const seriesColors = series.map((_, i) => {
    if (colors[i]) return resolveColor(colors[i])
    if (numSeries === 1) return resolveColor(barColor)
    return resolveColor(DEFAULT_COLORS[i % DEFAULT_COLORS.length])
  })

  // Bar geometry
  const categorySize = isVertical ? CHART_W / numCategories : CHART_H / numCategories
  const barGapRatio = 0.2
  const barRegion = categorySize * (1 - barGapRatio)
  const gapSize = categorySize * barGapRatio

  const handleMouseLeave = useCallback(() => {
    setHoveredBar(null)
  }, [])

  // Build bar rects
  const bars: React.ReactNode[] = []
  for (let c = 0; c < numCategories; c++) {
    if (stacked && numSeries > 1) {
      // Stacked bars
      let cumulative = 0
      for (let s = 0; s < numSeries; s++) {
        const val = series[s][c] ?? 0
        const barLen = (val / tickMax) * (isVertical ? CHART_H : CHART_W)
        const cumLen = (cumulative / tickMax) * (isVertical ? CHART_H : CHART_W)

        const isHovered = hoveredBar?.seriesIdx === s && hoveredBar?.catIdx === c

        if (isVertical) {
          bars.push(
            <rect
              key={`bar-${s}-${c}`}
              data-bar=""
              x={PAD_LEFT + c * categorySize + gapSize / 2}
              y={PAD_TOP + CHART_H - cumLen - barLen}
              width={barRegion}
              height={Math.max(barLen, 0)}
              fill={seriesColors[s]}
              rx={2}
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHoveredBar({ seriesIdx: s, catIdx: c })}
            />,
          )
        } else {
          bars.push(
            <rect
              key={`bar-${s}-${c}`}
              data-bar=""
              x={PAD_LEFT + cumLen}
              y={PAD_TOP + c * categorySize + gapSize / 2}
              width={Math.max(barLen, 0)}
              height={barRegion}
              fill={seriesColors[s]}
              rx={2}
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHoveredBar({ seriesIdx: s, catIdx: c })}
            />,
          )
        }
        cumulative += val
      }
    } else if (numSeries > 1) {
      // Grouped bars
      const subBarWidth = barRegion / numSeries
      for (let s = 0; s < numSeries; s++) {
        const val = series[s][c] ?? 0
        const barLen = (val / tickMax) * (isVertical ? CHART_H : CHART_W)
        const isHovered = hoveredBar?.seriesIdx === s && hoveredBar?.catIdx === c

        if (isVertical) {
          bars.push(
            <rect
              key={`bar-${s}-${c}`}
              data-bar=""
              x={PAD_LEFT + c * categorySize + gapSize / 2 + s * subBarWidth}
              y={PAD_TOP + CHART_H - barLen}
              width={subBarWidth}
              height={Math.max(barLen, 0)}
              fill={seriesColors[s]}
              rx={2}
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHoveredBar({ seriesIdx: s, catIdx: c })}
            />,
          )
        } else {
          bars.push(
            <rect
              key={`bar-${s}-${c}`}
              data-bar=""
              x={PAD_LEFT}
              y={PAD_TOP + c * categorySize + gapSize / 2 + s * subBarWidth}
              width={Math.max(barLen, 0)}
              height={subBarWidth}
              fill={seriesColors[s]}
              rx={2}
              opacity={isHovered ? 1 : 0.85}
              onMouseEnter={() => setHoveredBar({ seriesIdx: s, catIdx: c })}
            />,
          )
        }
      }
    } else {
      // Single series
      const val = series[0][c] ?? 0
      const barLen = (val / tickMax) * (isVertical ? CHART_H : CHART_W)
      const isHovered = hoveredBar?.seriesIdx === 0 && hoveredBar?.catIdx === c

      if (isVertical) {
        bars.push(
          <rect
            key={`bar-0-${c}`}
            data-bar=""
            x={PAD_LEFT + c * categorySize + gapSize / 2}
            y={PAD_TOP + CHART_H - barLen}
            width={barRegion}
            height={Math.max(barLen, 0)}
            fill={seriesColors[0]}
            rx={2}
            opacity={isHovered ? 1 : 0.85}
            onMouseEnter={() => setHoveredBar({ seriesIdx: 0, catIdx: c })}
          />,
        )
      } else {
        bars.push(
          <rect
            key={`bar-0-${c}`}
            data-bar=""
            x={PAD_LEFT}
            y={PAD_TOP + c * categorySize + gapSize / 2}
            width={Math.max(barLen, 0)}
            height={barRegion}
            fill={seriesColors[0]}
            rx={2}
            opacity={isHovered ? 1 : 0.85}
            onMouseEnter={() => setHoveredBar({ seriesIdx: 0, catIdx: c })}
          />,
        )
      }
    }
  }

  // Tooltip value
  let tooltipVal: string | null = null
  let tooltipX = 0
  let tooltipY = 0
  if (hoveredBar) {
    const { seriesIdx, catIdx } = hoveredBar
    const val = series[seriesIdx]?.[catIdx] ?? 0
    const label = labels[catIdx] ?? `${catIdx + 1}`
    tooltipVal = `${label}: ${val}`

    if (isVertical) {
      const barLen = (val / tickMax) * CHART_H
      tooltipX = PAD_LEFT + catIdx * categorySize + categorySize / 2
      tooltipY = PAD_TOP + CHART_H - barLen
    } else {
      const barLen = (val / tickMax) * CHART_W
      tooltipX = PAD_LEFT + barLen
      tooltipY = PAD_TOP + catIdx * categorySize + categorySize / 2
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      >
        {/* Title */}
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

        {/* Value axis labels and grid */}
        {ticks.map((tick) => {
          if (isVertical) {
            const y = PAD_TOP + (1 - tick / tickMax) * CHART_H
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={VB_W - PAD_RIGHT}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
                <text
                  x={PAD_LEFT - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize="9"
                >
                  {formatTick(tick)}
                </text>
              </g>
            )
          } else {
            const x = PAD_LEFT + (tick / tickMax) * CHART_W
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={x}
                  y1={PAD_TOP}
                  x2={x}
                  y2={PAD_TOP + CHART_H}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
                <text
                  x={x}
                  y={VB_H - 4}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="9"
                >
                  {formatTick(tick)}
                </text>
              </g>
            )
          }
        })}

        {/* Category labels */}
        {Array.from({ length: numCategories }, (_, i) => {
          const label = labels[i] ?? String(i + 1)
          if (isVertical) {
            return (
              <text
                key={`cat-${i}`}
                x={PAD_LEFT + i * categorySize + categorySize / 2}
                y={VB_H - 4}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {label}
              </text>
            )
          } else {
            return (
              <text
                key={`cat-${i}`}
                x={PAD_LEFT - 4}
                y={PAD_TOP + i * categorySize + categorySize / 2 + 3}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="9"
              >
                {label}
              </text>
            )
          }
        })}

        {/* Bars */}
        {bars}
      </svg>

      {/* Tooltip */}
      {tooltipVal && (
        <div
          style={{
            position: 'absolute',
            left: `${(tooltipX / VB_W) * 100}%`,
            top: `${(tooltipY / VB_H) * 100}%`,
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
          {tooltipVal}
        </div>
      )}
    </div>
  )
})

export default BarChart
