import React, { useState, useRef, useCallback } from 'react'
import { PencilLine, PaperPlaneTilt, CheckCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useQuickCapture, type CaptureRoute } from '@/lib/hooks/dashboard/useQuickCapture'
import type { WidgetProps } from '@/lib/widget-registry'

const ROUTE_OPTIONS: { value: CaptureRoute; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'idea', label: 'Idea' },
  { value: 'note', label: 'Note' },
]

export const QuickCaptureWidget = React.memo(function QuickCaptureWidget(_props: WidgetProps) {
  const { route, setRoute, captureMutation, successFlash, isPending } = useQuickCapture()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isPending) return
    captureMutation.mutate(trimmed, {
      onSuccess: () => {
        setText('')
        inputRef.current?.focus()
      },
    })
  }, [text, isPending, captureMutation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <PencilLine size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Quick Capture
        </span>
        {successFlash && (
          <CheckCircle size={14} weight="fill" style={{ color: 'var(--green-500)' }} />
        )}
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture a thought..."
          aria-label="Capture a thought"
          style={{
            flex: 1,
            fontSize: '14px',
            padding: '8px 12px',
            background: successFlash ? 'var(--green-500-a12, rgba(34, 197, 94, 0.12))' : 'var(--bg-white-03)',
            border: `1px solid ${successFlash ? 'var(--green-500-a25, rgba(34, 197, 94, 0.25))' : 'var(--border)'}`,
            borderRadius: '8px',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'border-color 0.15s, background 0.3s',
            minWidth: 0,
          }}
          onFocus={e => {
            if (!successFlash) e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onBlur={e => {
            if (!successFlash) e.currentTarget.style.borderColor = 'var(--border)'
          }}
        />
        <button
          type="submit"
          disabled={!text.trim() || isPending}
          aria-label="Submit capture"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            border: 'none',
            cursor: text.trim() && !isPending ? 'pointer' : 'not-allowed',
            background: text.trim() && !isPending ? 'var(--accent)' : 'var(--bg-white-03)',
            color: text.trim() && !isPending ? 'var(--text-on-accent)' : 'var(--text-muted)',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          <PaperPlaneTilt size={14} weight={text.trim() ? 'fill' : 'regular'} />
        </button>
      </form>

      {/* Route pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {ROUTE_OPTIONS.map(opt => {
          const active = route === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRoute(opt.value)}
              aria-pressed={active}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: `1px solid ${active ? 'var(--accent-a30, rgba(139, 92, 246, 0.3))' : 'var(--border)'}`,
                background: active ? 'var(--accent-a12, rgba(139, 92, 246, 0.12))' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                lineHeight: 1,
              }}
            >
              {opt.label}
            </button>
          )
        })}

        {/* Link to full capture page */}
        <button
          type="button"
          onClick={() => navigate('/capture')}
          aria-label="Open full capture page"
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            borderRadius: '999px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '10px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          className="hover-text-primary"
        >
          View all
        </button>
      </div>
    </div>
  )
})
