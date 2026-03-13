

import { useEffect, useState, useRef, useCallback } from 'react'
import { Zap, Trash2 } from 'lucide-react'

interface CaptureItem {
  id: string
  content: string
  routed_to: string | null
  routed_id: string | null
  created_at: string
}

const ROUTE_LABELS: Record<string, string> = {
  todo: '📋 Todo',
  idea: '💡 Idea',
  knowledge: '📚 Knowledge',
  pipeline: '🔄 Pipeline',
}

export default function CapturePage() {
  const [items, setItems] = useState<CaptureItem[]>([])
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [routing, setRouting] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchItems = useCallback(() => {
    fetch('/api/capture')
      .then(r => r.json())
      .then(d => setItems(d.items || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchItems()
    setMounted(true)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fetchItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || submitting) return
    setSubmitting(true)

    const optimisticItem: CaptureItem = {
      id: `temp-${Date.now()}`,
      content: input.trim(),
      routed_to: null,
      routed_id: null,
      created_at: new Date().toISOString(),
    }
    setItems(prev => [optimisticItem, ...prev])
    setInput('')

    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: optimisticItem.content }),
      })
      const json = await res.json()
      if (json.item) {
        setItems(prev => prev.map(i => i.id === optimisticItem.id ? json.item : i))
      }
    } catch {
      setItems(prev => prev.filter(i => i.id !== optimisticItem.id))
    } finally {
      setSubmitting(false)
    }
  }

  const routeItem = async (item: CaptureItem, destination: string) => {
    setRouting(item.id + destination)

    try {
      let routedId: string | null = null

      if (destination === 'todo') {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: item.content }),
        })
        const json = await res.json()
        routedId = json.todo?.id || null
      } else if (destination === 'idea') {
        const res = await fetch('/api/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.content }),
        })
        const json = await res.json()
        routedId = json.idea?.id || null
      } else if (destination === 'knowledge') {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.content, source_type: 'note' }),
        })
        const json = await res.json()
        routedId = json.entry?.id || null
      } else if (destination === 'pipeline') {
        const res = await fetch('/api/pipeline-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'capture', description: item.content }),
        })
        const json = await res.json()
        routedId = json.event?.id || null
      }

      const patchRes = await fetch('/api/capture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, routed_to: destination, routed_id: routedId }),
      })
      const patchJson = await patchRes.json()
      if (patchJson.item) {
        setItems(prev => prev.map(i => i.id === item.id ? patchJson.item : i))
      }
    } catch {
      // silently fail
    } finally {
      setRouting(null)
    }
  }

  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      await fetch('/api/capture', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {
      fetchItems()
    }
  }

  const unrouted = items.filter(i => !i.routed_to)
  const routed = items.filter(i => i.routed_to)

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Zap size={20} style={{ color: '#e6a817' }} />
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Quick Capture
          </h1>
          {mounted && unrouted.length > 0 && (
            <span className="badge badge-yellow" style={{ marginLeft: '4px' }}>
              {unrouted.length} unrouted
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          press / to focus · dump now, route later
        </p>
      </div>

      {/* Capture input */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Brain dump here. Sort it out later."
            autoFocus
            style={{
              flex: 1,
              padding: '14px 18px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '15px',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || submitting}
            style={{
              padding: '14px 22px',
              borderRadius: '10px',
              border: 'none',
              cursor: input.trim() && !submitting ? 'pointer' : 'not-allowed',
              background: input.trim() && !submitting ? 'var(--accent)' : 'var(--bg-panel)',
              color: input.trim() && !submitting ? '#fff' : 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            Capture
          </button>
        </div>
      </form>

      {/* Items */}
      {mounted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 0',
              color: 'var(--text-muted)',
              fontSize: '14px',
              fontStyle: 'italic',
            }}>
              Brain dump here. Sort it out later.
            </div>
          )}

          {/* Unrouted */}
          {unrouted.length > 0 && (
            <>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
                marginTop: '4px',
              }}>
                Unrouted
              </div>
              {unrouted.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid rgba(230,168,23,0.25)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
                      {item.content}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['todo', 'idea', 'knowledge', 'pipeline'] as const).map(dest => (
                      <button
                        key={dest}
                        onClick={() => routeItem(item, dest)}
                        disabled={routing === item.id + dest}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          transition: 'all 0.15s',
                          opacity: routing === item.id + dest ? 0.5 : 1,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(155,132,236,0.12)'
                          e.currentTarget.style.color = 'var(--accent-bright)'
                          e.currentTarget.style.borderColor = 'rgba(155,132,236,0.3)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                          e.currentTarget.style.borderColor = 'var(--border)'
                        }}
                      >
                        {ROUTE_LABELS[dest]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Routed */}
          {routed.length > 0 && (
            <>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '4px',
                marginTop: unrouted.length > 0 ? '16px' : '4px',
              }}>
                Routed
              </div>
              {routed.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    opacity: 0.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {item.content}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {item.routed_to && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '20px',
                          background: 'rgba(59,165,92,0.1)',
                          color: 'var(--green)',
                          border: '1px solid rgba(59,165,92,0.2)',
                        }}>
                          {ROUTE_LABELS[item.routed_to] || item.routed_to}
                        </span>
                      )}
                      <button
                        onClick={() => deleteItem(item.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
