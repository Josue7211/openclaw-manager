

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate as useRouterNavigate } from 'react-router-dom'
import { Search, Plus, Settings, ArrowRight } from 'lucide-react'
import { allNavItems } from '@/lib/nav-items'

interface PaletteItem {
  id: string
  label: string
  icon?: React.ReactNode
  action: () => void
  shortcut?: string
  category: 'page' | 'action'
}

const GO_SHORTCUTS: Record<string, string> = {
  '/personal': 'G H',
  '/': 'G D',
  '/agents': 'G A',
  '/missions': 'G M',
  '/calendar': 'G C',
  '/todos': 'G T',
  '/email': 'G E',
  '/settings': 'G S',
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouterNavigate()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      // Focus input after portal renders
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  const navigate = useCallback(
    (href: string) => {
      router(href)
      onClose()
    },
    [router, onClose],
  )

  const items: PaletteItem[] = useMemo(() => {
    const pages: PaletteItem[] = allNavItems.map((nav) => {
      const Icon = nav.icon
      return {
        id: `page-${nav.href}`,
        label: nav.label,
        icon: <Icon size={16} />,
        action: () => navigate(nav.href),
        shortcut: GO_SHORTCUTS[nav.href],
        category: 'page' as const,
      }
    })

    const actions: PaletteItem[] = [
      {
        id: 'action-new-todo',
        label: 'New Todo',
        icon: <Plus size={16} />,
        action: () => navigate('/todos'),
        category: 'action',
      },
      {
        id: 'action-new-mission',
        label: 'New Mission',
        icon: <Plus size={16} />,
        action: () => navigate('/missions'),
        category: 'action',
      },
      {
        id: 'action-settings',
        label: 'Go to Settings',
        icon: <Settings size={16} />,
        action: () => navigate('/settings'),
        shortcut: 'G S',
        category: 'action',
      },
    ]

    return [...pages, ...actions]
  }, [navigate])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter((item) => item.label.toLowerCase().includes(q))
  }, [query, items])

  // Group by category for display
  const groupedPages = useMemo(
    () => filtered.filter((i) => i.category === 'page'),
    [filtered],
  )
  const groupedActions = useMemo(
    () => filtered.filter((i) => i.category === 'action'),
    [filtered],
  )

  // Flat list for keyboard navigation
  const flatList = useMemo(
    () => [...groupedPages, ...groupedActions],
    [groupedPages, groupedActions],
  )

  // Clamp selected index when list changes
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(0, flatList.length - 1)))
  }, [flatList.length])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(
      `[data-idx="${selectedIdx}"]`,
    ) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatList[selectedIdx]) {
          flatList[selectedIdx].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  if (!open || !mounted) return null

  let flatIdx = 0

  return createPortal(
    <>
      <style>{`
        @keyframes cp-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cp-scalein {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9998,
          animation: 'cp-fadein 0.15s ease',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '400px',
          background: 'rgba(18, 18, 24, 0.96)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow:
            '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'cp-scalein 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            flexShrink: 0,
          }}
        >
          <Search
            size={16}
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIdx(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, agents, actions..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontWeight: 450,
              caretColor: 'var(--accent)',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              borderRadius: '5px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            flex: 1,
            padding: '6px 0',
          }}
        >
          {flatList.length === 0 && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {groupedPages.length > 0 && (
            <div>
              <div
                style={{
                  padding: '8px 18px 4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {query.trim() ? 'Pages' : 'All Pages'}
              </div>
              {groupedPages.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}

          {groupedActions.length > 0 && (
            <div>
              <div
                style={{
                  padding:
                    groupedPages.length > 0
                      ? '12px 18px 4px'
                      : '8px 18px 4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  borderTop:
                    groupedPages.length > 0
                      ? '1px solid rgba(255, 255, 255, 0.04)'
                      : undefined,
                }}
              >
                Actions
              </div>
              {groupedActions.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    active={active}
                    dataIdx={idx}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => item.action()}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div
          style={{
            padding: '8px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <span>
            <kbd style={kbdSmall}>&#8593;&#8595;</kbd> navigate
          </span>
          <span>
            <kbd style={kbdSmall}>&#8629;</kbd> open
          </span>
          <span>
            <kbd style={kbdSmall}>esc</kbd> close
          </span>
        </div>
      </div>
    </>,
    document.body,
  )
}

function PaletteRow({
  item,
  active,
  dataIdx,
  onMouseEnter,
  onClick,
}: {
  item: PaletteItem
  active: boolean
  dataIdx: number
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <div
      data-idx={dataIdx}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 18px',
        margin: '0 6px',
        borderRadius: '10px',
        cursor: 'pointer',
        background: active ? 'rgba(167, 139, 250, 0.1)' : 'transparent',
        transition: 'background 0.1s ease',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: active
            ? 'rgba(167, 139, 250, 0.15)'
            : 'rgba(255, 255, 255, 0.04)',
          color: active ? 'var(--accent)' : 'var(--text-secondary)',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
      >
        {item.icon || <ArrowRight size={14} />}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: '13px',
          fontWeight: active ? 500 : 400,
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          transition: 'color 0.1s ease',
        }}
      >
        {item.label}
      </span>
      {item.shortcut && (
        <span
          style={{
            display: 'flex',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          {item.shortcut.split(' ').map((key, i) => (
            <kbd key={i} style={kbdHint}>
              {key}
            </kbd>
          ))}
        </span>
      )}
    </div>
  )
}

const kbdHint: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '20px',
  height: '20px',
  padding: '0 5px',
  borderRadius: '5px',
  fontSize: '11px',
  fontWeight: 500,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-muted)',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  lineHeight: 1,
}

const kbdSmall: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  borderRadius: '4px',
  fontSize: '10px',
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-muted)',
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  marginRight: '4px',
  lineHeight: 1.5,
}
