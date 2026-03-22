import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { GearSix } from '@phosphor-icons/react'
import { getWidget } from '@/lib/widget-registry'
import { updateWidgetConfig } from '@/lib/dashboard-store'
import type { WidgetConfigSchema } from '@/lib/widget-registry'

// ---------------------------------------------------------------------------
// WidgetConfigPanel
// ---------------------------------------------------------------------------

interface WidgetConfigPanelProps {
  widgetId: string
  pluginId: string
  pageId: string
  config: Record<string, unknown>
  anchorRef: React.RefObject<HTMLElement>
  onClose: () => void
}

export const WidgetConfigPanel = React.memo(function WidgetConfigPanel({
  widgetId,
  pluginId,
  pageId,
  config,
  anchorRef,
  onClose,
}: WidgetConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const widgetDef = useMemo(() => getWidget(pluginId), [pluginId])
  const schema = widgetDef?.configSchema

  // Compute position from anchor
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left - 240 + rect.width),
      })
    }
  }, [anchorRef])

  // Handle escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Handle click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // requestAnimationFrame guarantees we skip the current event cycle
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handler)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Build current config with defaults
  const currentConfig = useMemo(() => {
    const defaults: Record<string, unknown> = { showTitle: false }
    if (schema) {
      for (const field of schema.fields) {
        defaults[field.key] = field.default
      }
    }
    return { ...defaults, ...config }
  }, [config, schema])

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const next = { ...currentConfig, [key]: value }
      updateWidgetConfig(pageId, widgetId, next)
    },
    [currentConfig, pageId, widgetId],
  )

  const handleReset = useCallback(() => {
    const defaults: Record<string, unknown> = { showTitle: false }
    if (schema) {
      for (const field of schema.fields) {
        defaults[field.key] = field.default
      }
    }
    updateWidgetConfig(pageId, widgetId, defaults)
  }, [schema, pageId, widgetId])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Widget Settings"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: '280px',
        background: 'var(--bg-card-solid)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 'var(--z-dropdown)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <GearSix size={16} style={{ color: 'var(--text-muted)' }} />
        Widget Settings
      </div>

      {/* Universal toggle: Show title header */}
      <ConfigToggle
        label="Show title header"
        checked={Boolean(currentConfig.showTitle)}
        onChange={(v) => handleChange('showTitle', v)}
      />

      {/* Schema fields */}
      {schema?.fields.map((field) => {
        const value = currentConfig[field.key]

        switch (field.type) {
          case 'toggle':
            return (
              <ConfigToggle
                key={field.key}
                label={field.label}
                checked={Boolean(value)}
                onChange={(v) => handleChange(field.key, v)}
              />
            )

          case 'slider':
            return (
              <ConfigSlider
                key={field.key}
                label={field.label}
                value={Number(value ?? field.default)}
                min={field.min ?? 0}
                max={field.max ?? 100}
                onChange={(v) => handleChange(field.key, v)}
              />
            )

          case 'select':
            return (
              <ConfigSelect
                key={field.key}
                label={field.label}
                value={String(value ?? field.default)}
                options={field.options ?? []}
                onChange={(v) => handleChange(field.key, v)}
              />
            )

          case 'text':
            return (
              <ConfigText
                key={field.key}
                label={field.label}
                value={String(value ?? field.default ?? '')}
                onChange={(v) => handleChange(field.key, v)}
              />
            )

          case 'number':
            return (
              <ConfigNumber
                key={field.key}
                label={field.label}
                value={Number(value ?? field.default ?? 0)}
                min={field.min}
                max={field.max}
                onChange={(v) => handleChange(field.key, v)}
              />
            )

          default:
            return null
        }
      })}

      {/* Reset to default */}
      <button
        onClick={handleReset}
        style={{
          padding: '6px 12px',
          borderRadius: '8px',
          border: 'none',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          background: 'transparent',
          color: 'var(--text-muted)',
          textAlign: 'left',
        }}
      >
        Reset to default
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

const fieldLabelStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-secondary)',
}

const ConfigToggle = React.memo(function ConfigToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span style={fieldLabelStyle}>{label}</span>
      <button
        role="switch"
        aria-checked={checked ? 'true' : 'false'}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--accent)' : 'var(--hover-bg)',
          position: 'relative',
          transition: 'background 150ms ease',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '999px',
            background: 'white',
            transition: 'left 150ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  )
})

const ConfigSlider = React.memo(function ConfigSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={fieldLabelStyle}>{label}</span>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        role="slider"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  )
})

const ConfigSelect = React.memo(function ConfigSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ label: string; value: unknown }>
  onChange: (v: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      <span style={fieldLabelStyle}>{label}</span>
      <select
        role="combobox"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '4px 8px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
})

const ConfigText = React.memo(function ConfigText({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={fieldLabelStyle}>{label}</span>
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
    </div>
  )
})

const ConfigNumber = React.memo(function ConfigNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={fieldLabelStyle}>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          padding: '6px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          outline: 'none',
          width: '80px',
        }}
      />
    </div>
  )
})
