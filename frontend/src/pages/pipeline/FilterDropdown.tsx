import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

export function FilterDropdown({ label, value, options, onChange, colorMap }: {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
  colorMap?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeColor = value && colorMap?.[value]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '4px 10px',
          borderRadius: '8px',
          border: '1px solid',
          borderColor: value ? (activeColor ? `${activeColor}66` : 'var(--purple-a30)') : 'var(--hover-bg-bright)',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
          background: value ? (activeColor ? `${activeColor}15` : 'var(--purple-a08)') : 'transparent',
          color: value ? (activeColor || 'var(--accent-bright)') : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          transition: 'all 0.15s var(--ease-spring)',
        }}
      >
        {label}{value ? `: ${value}` : ''}
        <ChevronDown size={11} style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease',
        }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          minWidth: '140px',
          background: 'var(--bg-modal)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border-hover)',
          borderRadius: '10px',
          padding: '4px',
          zIndex: 100,
          boxShadow: '0 8px 24px var(--overlay-light)',
          animation: 'fadeInUp 0.12s var(--ease-spring) both',
        }}>
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              className="hover-bg"
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                background: 'transparent', color: 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              Clear
            </button>
          )}
          {options.map(opt => {
            const active = value === opt
            const optColor = colorMap?.[opt]
            return (
              <button
                key={opt}
                onClick={() => { onChange(active ? null : opt); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                  border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: active ? 600 : 450,
                  background: active ? 'var(--purple-a12)' : 'transparent',
                  color: active ? (optColor || 'var(--accent-bright)') : (optColor || 'var(--text-secondary)'),
                  transition: 'background 0.1s',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--active-bg)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
