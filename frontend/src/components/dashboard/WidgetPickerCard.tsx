import React, { useState, useMemo, useCallback } from 'react'
import {
  Robot,
  Heartbeat,
  UsersThree,
  Rocket,
  Brain,
  Lightbulb,
  WifiHigh,
  Terminal,
  Cube,
} from '@phosphor-icons/react'
import type { WidgetDefinition } from '@/lib/widget-registry'

// ---------------------------------------------------------------------------
// Icon lookup (Phosphor icon name string -> component)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  Robot,
  Heartbeat,
  UsersThree,
  Rocket,
  Brain,
  Lightbulb,
  WifiHigh,
  Terminal,
  Cube,
}

// ---------------------------------------------------------------------------
// Size presets
// ---------------------------------------------------------------------------

const SIZE_PRESETS = [
  { label: 'S', w: 1, h: 2 },
  { label: 'M', w: 2, h: 2 },
  { label: 'L', w: 2, h: 3 },
  { label: 'XL', w: 4, h: 3 },
] as const

function closestPresetIndex(defaultSize: { w: number; h: number }): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < SIZE_PRESETS.length; i++) {
    const dx = SIZE_PRESETS[i].w - defaultSize.w
    const dy = SIZE_PRESETS[i].h - defaultSize.h
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// WidgetPickerCard
// ---------------------------------------------------------------------------

interface WidgetPickerCardProps {
  widget: WidgetDefinition
  onAdd: (size: { w: number; h: number }) => void
}

export const WidgetPickerCard = React.memo(function WidgetPickerCard({
  widget,
  onAdd,
}: WidgetPickerCardProps) {
  const defaultIdx = useMemo(
    () => closestPresetIndex(widget.defaultSize),
    [widget.defaultSize],
  )
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx)

  const Icon = ICON_MAP[widget.icon] || Cube

  const handleAdd = useCallback(() => {
    const preset = SIZE_PRESETS[selectedIdx]
    onAdd({ w: preset.w, h: preset.h })
  }, [selectedIdx, onAdd])

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        transition: 'border-color 150ms ease',
      }}
    >
      {/* Icon + Name + Description */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '8px',
            background: 'var(--accent-a12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={20} weight="duotone" style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
            }}
          >
            {widget.name}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
              marginTop: '2px',
            }}
          >
            {widget.description}
          </div>
        </div>
      </div>

      {/* Size presets + Add button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {SIZE_PRESETS.map((preset, idx) => {
            const selected = idx === selectedIdx
            return (
              <button
                key={preset.label}
                aria-pressed={selected ? 'true' : 'false'}
                onClick={() => setSelectedIdx(idx)}
                style={{
                  minWidth: '24px',
                  height: '20px',
                  padding: '0 6px',
                  borderRadius: '999px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selected ? 'var(--accent-a12)' : 'var(--hover-bg)',
                  color: selected ? 'var(--accent)' : 'var(--text-muted)',
                  transition: 'all 150ms ease',
                  fontFamily: 'inherit',
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            borderRadius: '999px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: 'var(--accent)',
            color: 'var(--text-on-color)',
            transition: 'all 150ms ease',
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
})
