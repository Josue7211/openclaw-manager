/**
 * FormWidget primitive -- schema-driven form with multiple field types.
 *
 * Config keys: title (string), submitLabel (string), fields (FormField[])
 * Field types: text, number, select, toggle, date
 */

import React, { useState, useCallback } from 'react'
import { TextAa } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { EmptyState } from '@/components/ui/EmptyState'
import { configString, configArray } from './shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'toggle' | 'date'
  default?: unknown
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Form' },
    { key: 'submitLabel', label: 'Submit Label', type: 'text', default: 'Submit' },
  ],
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--red)',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FormWidget = React.memo(function FormWidget({ config }: WidgetProps) {
  const title = configString(config, 'title', 'Form')
  const submitLabel = configString(config, 'submitLabel', 'Submit')
  const fields = configArray<FormField>(config, 'fields')

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const f of fields) {
      initial[f.key] = f.default ?? (f.type === 'toggle' ? false : '')
    }
    return initial
  })

  const [errors, setErrors] = useState<Set<string>>(new Set())

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setErrors(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    const invalid = new Set<string>()
    for (const f of fields) {
      if (f.required) {
        const v = values[f.key]
        if (v === '' || v === undefined || v === null) {
          invalid.add(f.key)
        }
      }
    }
    if (invalid.size > 0) {
      setErrors(invalid)
      return
    }
    // Reset form after successful submit
    const initial: Record<string, unknown> = {}
    for (const f of fields) {
      initial[f.key] = f.default ?? (f.type === 'toggle' ? false : '')
    }
    setValues(initial)
    setErrors(new Set())
  }, [fields, values])

  if (fields.length === 0) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <EmptyState icon={TextAa} title="No fields" description="Add form fields in widget config" />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        overflowY: 'auto',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {title && (
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>
      )}

      {fields.map(field => (
        <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label
            htmlFor={`form-${field.key}`}
            style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
          >
            {field.label}
            {field.required && <span style={{ color: 'var(--red)', marginLeft: '2px' }}>*</span>}
          </label>

          {field.type === 'text' && (
            <input
              id={`form-${field.key}`}
              type="text"
              aria-label={field.label}
              value={String(values[field.key] ?? '')}
              onChange={e => handleChange(field.key, e.target.value)}
              style={errors.has(field.key) ? inputErrorStyle : inputStyle}
            />
          )}

          {field.type === 'number' && (
            <input
              id={`form-${field.key}`}
              type="number"
              aria-label={field.label}
              value={String(values[field.key] ?? '')}
              onChange={e => handleChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
              style={errors.has(field.key) ? inputErrorStyle : inputStyle}
            />
          )}

          {field.type === 'select' && (
            <select
              id={`form-${field.key}`}
              aria-label={field.label}
              value={String(values[field.key] ?? '')}
              onChange={e => handleChange(field.key, e.target.value)}
              style={errors.has(field.key) ? inputErrorStyle : inputStyle}
            >
              <option value="">Select...</option>
              {(field.options ?? []).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {field.type === 'toggle' && (
            <button
              id={`form-${field.key}`}
              type="button"
              role="switch"
              aria-checked={Boolean(values[field.key])}
              aria-label={field.label}
              onClick={() => handleChange(field.key, !values[field.key])}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                background: values[field.key] ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: values[field.key] ? '22px' : '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          )}

          {field.type === 'date' && (
            <input
              id={`form-${field.key}`}
              type="date"
              aria-label={field.label}
              value={String(values[field.key] ?? '')}
              onChange={e => handleChange(field.key, e.target.value)}
              style={errors.has(field.key) ? inputErrorStyle : inputStyle}
            />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={handleSubmit}
        style={{
          background: 'var(--accent)',
          color: 'var(--text-on-color)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 16px',
          fontWeight: 600,
          fontSize: '14px',
          border: 'none',
          cursor: 'pointer',
          marginTop: '4px',
        }}
      >
        {submitLabel}
      </button>
    </div>
  )
})

export default FormWidget
