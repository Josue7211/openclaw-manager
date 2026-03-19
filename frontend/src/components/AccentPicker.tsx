import React, { useState, useRef, useEffect } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { ACCENT_PRESETS } from '@/lib/themes'

interface AccentPickerProps {
  color: string
  onChange: (color: string) => void
  label?: string
}

/**
 * AccentPicker — row of 7 preset swatch buttons + custom color picker trigger.
 * Uses react-colorful for the custom hex color popover.
 */
const AccentPicker = React.memo(function AccentPicker({ color, onChange, label = 'Accent' }: AccentPickerProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on click outside
  useEffect(() => {
    if (!customOpen) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [customOpen])

  const isPreset = ACCENT_PRESETS.some(p => p.color.toLowerCase() === color.toLowerCase())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {label && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {label} color
        </span>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', position: 'relative' }}>
        {/* 7 preset swatch buttons */}
        {ACCENT_PRESETS.map((preset) => {
          const active = preset.color.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={preset.id}
              aria-label={`${preset.label} accent`}
              aria-pressed={active}
              onClick={() => onChange(preset.color)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: preset.color,
                border: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                outline: active ? `2px solid ${preset.color}` : 'none',
                outlineOffset: active ? 2 : 0,
                transform: active ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 150ms ease-out, outline 150ms ease-out, border 150ms ease-out',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            />
          )
        })}

        {/* Custom picker trigger button */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <button
            aria-label="Custom accent color"
            aria-pressed={!isPreset}
            onClick={() => setCustomOpen(prev => !prev)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
              border: !isPreset ? '2px solid var(--text-primary)' : '2px solid transparent',
              outline: !isPreset ? `2px solid ${color}` : 'none',
              outlineOffset: !isPreset ? 2 : 0,
              transform: !isPreset ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 150ms ease-out, outline 150ms ease-out, border 150ms ease-out',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />

          {/* Custom color popover */}
          {customOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                zIndex: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-high)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <HexColorPicker color={color} onChange={onChange} />
              <HexColorInput
                color={color}
                onChange={onChange}
                prefixed
                alpha
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '6px 10px',
                  fontSize: 'var(--text-sm)',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                aria-label="Hex color value"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default AccentPicker
