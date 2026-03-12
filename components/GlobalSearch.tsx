'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, CheckSquare, Target, CalendarDays, Mail, Bell, BookOpen, Loader2 } from 'lucide-react'

interface Todo { id: string; text: string; done: boolean }
interface Mission { id: string; title: string; status: string }
interface CalEvent { id: string; title: string; start: string; allDay: boolean; calendar: string }
interface Email { id: string; from: string; subject: string; date: string; read: boolean }
interface Reminder { id: string; title: string; completed: boolean; dueDate?: string; list: string }
interface Knowledge { id: string; title: string; content?: string; tags: string[] }
interface Results { todos: Todo[]; missions: Mission[]; events: CalEvent[]; emails: Email[]; reminders: Reminder[]; knowledge: Knowledge[] }

type FlatResult = { id: string; label: string; sub: string; href: string; icon: React.ElementType }

function flattenResults(results: Results): FlatResult[] {
  const flat: FlatResult[] = []
  ;(results.todos || []).forEach(t => flat.push({ id: 'todo-' + t.id, label: t.text, sub: t.done ? 'done' : 'open', href: '/todos', icon: CheckSquare }))
  ;(results.missions || []).forEach(m => flat.push({ id: 'mis-' + m.id, label: m.title, sub: m.status, href: '/missions', icon: Target }))
  ;(results.events || []).forEach(e => flat.push({ id: 'evt-' + e.id, label: e.title, sub: e.calendar + ' · ' + (e.allDay ? new Date(e.start).toLocaleDateString() : new Date(e.start).toLocaleString()), href: '/calendar', icon: CalendarDays }))
  ;(results.emails || []).forEach(e => flat.push({ id: 'em-' + e.id, label: e.subject, sub: e.from + ' · ' + new Date(e.date).toLocaleDateString(), href: '/email', icon: Mail }))
  ;(results.reminders || []).forEach(r => flat.push({ id: 'rem-' + r.id, label: r.title, sub: r.list + ' · ' + (r.completed ? 'completed' : (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'no due date')), href: '/reminders', icon: Bell }))
  ;(results.knowledge || []).forEach(k => flat.push({ id: 'kn-' + k.id, label: k.title, sub: (k.tags || []).length > 0 ? k.tags.join(', ') : 'no tags', href: '/knowledge', icon: BookOpen }))
  return flat
}

export default function GlobalSearch({ compact, collapsed }: { compact?: boolean; collapsed?: boolean } = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  const open = query.length > 0

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
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
      if (item) { router.push(item.href); close() }
    }
  }

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // The overlay (backdrop + spotlight popup) must render via portal to document.body
  // because the sidebar's backdrop-filter creates a stacking context that traps
  // position:fixed children.
  const overlay = open && mounted ? createPortal(
    <>
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
        <div style={{ overflowY: 'auto', flex: 1 }}>
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
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => { router.push(item.href); close() }}
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
    </>,
    document.body,
  ) : null

  return (
    <>
      {/* Input — compact (sidebar) or full top bar */}
      {compact ? (
        !collapsed && (
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
              <input
                ref={inputRef}
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  minWidth: 0,
                }}
              />
              {loading
                ? <Loader2 size={13} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                : <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>⌘K</span>
              }
            </div>
          </div>
        )
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
