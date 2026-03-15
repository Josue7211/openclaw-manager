

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, CheckSquare, Target, CalendarDays, Mail, Bell, BookOpen, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import type { SearchResults, FlatSearchResult } from '@/lib/types'

const LISTBOX_ID = 'gs-results-listbox'

function flattenResults(results: SearchResults): FlatSearchResult[] {
  const flat: FlatSearchResult[] = []
  ;(results.todos || []).forEach(t => flat.push({ id: 'todo-' + t.id, label: t.text, sub: t.done ? 'done' : 'open', href: '/todos', icon: CheckSquare }))
  ;(results.missions || []).forEach(m => flat.push({ id: 'mis-' + m.id, label: m.title, sub: m.status, href: '/missions', icon: Target }))
  ;(results.events || []).forEach(e => flat.push({ id: 'evt-' + e.id, label: e.title, sub: e.calendar + ' · ' + (e.allDay ? new Date(e.start).toLocaleDateString() : new Date(e.start).toLocaleString()), href: '/calendar', icon: CalendarDays }))
  ;(results.emails || []).forEach(e => flat.push({ id: 'em-' + e.id, label: e.subject, sub: e.from + ' · ' + new Date(e.date).toLocaleDateString(), href: '/email', icon: Mail }))
  ;(results.reminders || []).forEach(r => flat.push({ id: 'rem-' + r.id, label: r.title, sub: r.list + ' · ' + (r.completed ? 'completed' : (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'no due date')), href: '/reminders', icon: Bell }))
  ;(results.knowledge || []).forEach(k => flat.push({ id: 'kn-' + k.id, label: k.title, sub: (k.tags || []).length > 0 ? k.tags.join(', ') : 'no tags', href: '/knowledge', icon: BookOpen }))
  return flat
}

export default function GlobalSearch({ compact, collapsed, sidebarWidth }: { compact?: boolean; collapsed?: boolean; sidebarWidth?: number } = {}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const open = query.length > 0

  // Focus trap for the spotlight overlay
  const trapRef = useFocusTrap(open)

  useEffect(() => { setMounted(true) }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); setLoading(false); return }
    setLoading(true)
    try {
      const data = await api.get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`)
      setResults(data)
    } catch {
      setResults({ todos: [], missions: [], events: [], emails: [], reminders: [], knowledge: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setActiveIdx(0)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) { setResults(null); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(() => doSearch(val), 300)
  }

  const close = () => {
    setQuery('')
    setResults(null)
    setLoading(false)
  }

  const flat = results ? flattenResults(results) : []

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return }
    if (!open || flat.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIdx]
      if (item) { navigate(item.href); close() }
    }
  }

  // NOTE: No Cmd+K handler here — the global shortcut is managed by the
  // keybinding system in LayoutShell to avoid duplicate listeners.

  const activeItemId = flat.length > 0 ? `gs-option-${flat[activeIdx]?.id}` : undefined

  // The overlay (backdrop + spotlight popup) must render via portal to document.body
  // because the sidebar's backdrop-filter creates a stacking context that traps
  // position:fixed children.
  const overlay = open && mounted ? createPortal(
    <div ref={trapRef}>
      <style>{`
        @keyframes gs-fadein { from { opacity: 0; transform: translateY(-8px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          zIndex: 9990,
        }}
      />

      {/* Spotlight popup */}
      <div style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '640px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '480px',
        background: 'rgba(22, 22, 28, 0.95)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        zIndex: 9991,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'gs-fadein 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        {/* Search input inside popup */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}>
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500 }}>
            {query}
          </div>
          {loading && (
            <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          )}
        </div>

        {/* Results */}
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Search results"
          style={{ overflowY: 'auto', flex: 1 }}
        >
          {loading && flat.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Searching...
            </div>
          )}
          {!loading && results && flat.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {flat.map((item, idx) => {
            const Icon = item.icon
            const active = idx === activeIdx
            return (
              <div
                key={item.id}
                id={`gs-option-${item.id}`}
                role="option"
                aria-selected={active}
                className="hover-bg"
                onClick={() => { navigate(item.href); close() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  background: active ? 'rgba(167,139,250,0.1)' : 'transparent',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  borderRadius: '0 8px 8px 0',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} style={{ color: active ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sub}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {flat.length > 0 && (
          <div style={{
            padding: '8px 18px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            gap: '16px',
            flexShrink: 0,
          }}>
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  // ── Collapsed sidebar: show a search icon that triggers the command palette ──
  if (compact && collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
        <button
          aria-label="Search"
          className="hover-bg"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'k',
              code: 'KeyK',
              metaKey: true,
              ctrlKey: false,
              bubbles: true,
            }))
          }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Search size={16} />
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Input — compact (sidebar) or full top bar */}
      {compact ? (
        <div style={{
          padding: '0 8px',
          marginBottom: '8px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            height: '36px',
            transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
            padding: '0 10px',
          }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {(() => {
              // Typewriter placeholder with blinking cursor
              const fullText = 'Search'
              const charW = 8
              const textAvail = Math.max(0, (sidebarWidth || 200) - 58)
              const charsVisible = Math.min(fullText.length, Math.floor(textAvail / charW))
              const visibleText = fullText.slice(0, charsVisible)
              const isTyping = charsVisible > 0
              return (
                <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder=""
                    aria-label="Search"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={LISTBOX_ID}
                    aria-activedescendant={activeItemId}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      minWidth: 0,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                  {!query && !focused && charsVisible > 0 && (
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}>
                      {visibleText}
                      {isTyping && <span className="type-cursor">|</span>}
                    </span>
                  )}
                </div>
              )
            })()}
            {(() => {
              const sw = sidebarWidth || 200
              if (loading) return <Loader2 size={13} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              if (sw < 130) return null
              return <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>⌘K</span>
            })()}
          </div>
        </div>
      ) : (
        <div style={{
          position: 'relative',
          zIndex: 200,
          width: '100%',
          height: '44px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}>
          <Search size={14} style={{ color: 'var(--text-muted)', marginRight: '10px', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            aria-label="Search"
            role="combobox"
            aria-expanded={open}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeItemId}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />
          {loading
            ? <Loader2 size={13} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>⌘K</span>
          }
        </div>
      )}

      {/* Portal: renders backdrop + spotlight popup at document.body level */}
      {overlay}
    </>
  )
}
