import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ElementType,
} from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'

export interface CommandAction {
  id: string
  label: string
  detail?: string
  icon: ElementType
  onRun: () => void
}

export function NotesCommandPalette({
  query,
  items,
  onQueryChange,
  onClose,
}: {
  query: string
  items: CommandAction[]
  onQueryChange: (query: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 24)
    return items
      .filter(item => item.label.toLowerCase().includes(q) || item.detail?.toLowerCase().includes(q))
      .slice(0, 24)
  }, [items, query])

  const run = useCallback(
    (item: CommandAction) => {
      item.onRun()
      onClose()
    },
    [onClose],
  )

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Enter' && filtered[0]) {
        event.preventDefault()
        run(filtered[0])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, onClose, run])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes command palette"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
        background: 'rgba(0, 0, 0, 0.36)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: 'min(680px, calc(100vw - 32px))',
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-panel)',
          boxShadow: '0 24px 80px var(--overlay-heavy)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <MagnifyingGlass size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search notes or run a command..."
            aria-label="Search notes or run a command"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '26px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              No commands or notes found
            </div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => run(item)}
                  className="hover-bg"
                  style={{
                    width: '100%',
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: index === 0 ? 'var(--bg-white-04)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '7px 10px',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    {item.detail && (
                      <span
                        style={{
                          display: 'block',
                          marginTop: 1,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.detail}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
