import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
} from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'

export interface CommandAction {
  id: string
  label: string
  detail?: string
  icon: ElementType
  keywords?: string[]
  category?: string
  rank?: number
  onRun: () => void
}

export function rankCommandActions(items: CommandAction[], query: string, limit = 24): CommandAction[] {
  const q = query.trim().toLowerCase()
  return items
    .map((item, index) => ({
      item,
      index,
      score: q ? commandMatchScore(item, q) : item.rank ?? 0,
    }))
    .filter(entry => !q || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(entry => entry.item)
}

function commandMatchScore(item: CommandAction, query: string): number {
  const rankBoost = item.rank ?? 0
  const texts = [item.label, item.detail ?? '', ...(item.keywords ?? [])].filter(Boolean)
  const terms = query.split(/\s+/).filter(Boolean)
  if (terms.length > 1) {
    let total = 0
    for (const term of terms) {
      const score = Math.max(...texts.map(text => textScore(text.toLowerCase(), term)), 0)
      if (score <= 0) return 0
      total += score
    }
    return 160 + total / terms.length + rankBoost
  }
  const best = Math.max(...texts.map(text => textScore(text.toLowerCase(), query)), 0)
  return best > 0 ? best + rankBoost : 0
}

function textScore(text: string, query: string): number {
  if (!text) return 0
  if (text === query) return 1000
  if (text.startsWith(query)) return 850
  if (text.split(/[^a-z0-9]+/).some(part => part.startsWith(query))) return 760
  if (text.includes(query)) return 560
  const fuzzy = fuzzyScore(text, query)
  return fuzzy > 0 ? 320 + fuzzy : 0
}

function fuzzyScore(text: string, query: string): number {
  let cursor = 0
  let gaps = 0
  for (const char of query) {
    const found = text.indexOf(char, cursor)
    if (found === -1) return 0
    gaps += found - cursor
    cursor = found + 1
  }
  return Math.max(1, 80 - gaps)
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
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered = useMemo(() => {
    return rankCommandActions(items, query)
  }, [items, query])
  const listboxId = 'notes-command-palette-results'
  const activeItemId = filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const run = useCallback(
    (item: CommandAction) => {
      item.onRun()
      onClose()
    },
    [onClose],
  )

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    inputRef.current?.focus()
    return () => {
      requestAnimationFrame(() => restoreFocusRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'ArrowDown' && filtered.length > 0) {
        event.preventDefault()
        setActiveIndex(index => (index + 1) % filtered.length)
      }
      if (event.key === 'ArrowUp' && filtered.length > 0) {
        event.preventDefault()
        setActiveIndex(index => (index - 1 + filtered.length) % filtered.length)
      }
      if (event.key === 'Home' && filtered.length > 0) {
        event.preventDefault()
        setActiveIndex(0)
      }
      if (event.key === 'End' && filtered.length > 0) {
        event.preventDefault()
        setActiveIndex(filtered.length - 1)
      }
      if (event.key === 'Enter' && filtered[activeIndex]) {
        event.preventDefault()
        run(filtered[activeIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, filtered, onClose, run])

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
            role="combobox"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Search notes or run a command..."
            aria-label="Search notes or run a command"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={activeItemId}
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

        <div id={listboxId} role="listbox" aria-label="Command results" style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div role="status" style={{ padding: '26px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              No commands or notes found
            </div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon
              const active = index === activeIndex
              const category = item.category || 'Commands'
              const showCategory = index === 0 || (filtered[index - 1].category || 'Commands') !== category
              return (
                <Fragment key={item.id}>
                  {showCategory && (
                    <div
                      role="presentation"
                      style={{
                        padding: index === 0 ? '3px 10px 5px' : '10px 10px 5px',
                        color: 'var(--text-faint)',
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1,
                        textTransform: 'uppercase',
                      }}
                    >
                      {category}
                    </div>
                  )}
                  <button
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    onClick={() => run(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="hover-bg"
                    aria-selected={active}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      background: active ? 'var(--bg-white-04)' : 'transparent',
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
                </Fragment>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
