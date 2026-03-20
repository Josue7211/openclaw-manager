


import { useEffect, useState, useRef } from 'react'
import { Lightning, Trash } from '@phosphor-icons/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'

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
  const queryClient = useQueryClient()

  const { data: captureData, isLoading } = useQuery<{ items: CaptureItem[] }>({
    queryKey: ['capture'],
    queryFn: () => api.get<{ items: CaptureItem[] }>('/api/capture'),
  })

  const items = captureData?.items ?? []

  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [routing, setRouting] = useState<string | null>(null)
  const [optimisticItems, setOptimisticItems] = useState<CaptureItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Merge optimistic items with server items
  const displayItems = [...optimisticItems.filter(o => !items.some(i => i.id === o.id || (o.id.startsWith('temp-') && i.content === o.content))), ...items]

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const invalidateCapture = () => queryClient.invalidateQueries({ queryKey: ['capture'] })

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
    setOptimisticItems(prev => [optimisticItem, ...prev])
    setInput('')

    try {
      await api.post('/api/capture', { content: optimisticItem.content })
      invalidateCapture()
      setOptimisticItems(prev => prev.filter(i => i.id !== optimisticItem.id))
    } catch {
      setOptimisticItems(prev => prev.filter(i => i.id !== optimisticItem.id))
    } finally {
      setSubmitting(false)
    }
  }

  const routeMutation = useMutation({
    mutationFn: async ({ item, destination }: { item: CaptureItem; destination: string }) => {
      let routedId: string | null = null

      if (destination === 'todo') {
        const json = await api.post<{ todo?: { id: string } }>('/api/todos', { text: item.content })
        routedId = json.todo?.id || null
      } else if (destination === 'idea') {
        const json = await api.post<{ idea?: { id: string } }>('/api/ideas', { title: item.content })
        routedId = json.idea?.id || null
      } else if (destination === 'knowledge') {
        const json = await api.post<{ entry?: { id: string } }>('/api/knowledge', { title: item.content, source_type: 'note' })
        routedId = json.entry?.id || null
      } else if (destination === 'pipeline') {
        const json = await api.post<{ event?: { id: string } }>('/api/pipeline-events', { event_type: 'capture', description: item.content })
        routedId = json.event?.id || null
      }

      await api.patch('/api/capture', { id: item.id, routed_to: destination, routed_id: routedId })
    },
    onSuccess: () => invalidateCapture(),
  })

  const routeItem = async (item: CaptureItem, destination: string) => {
    setRouting(item.id + destination)
    try {
      await routeMutation.mutateAsync({ item, destination })
    } finally {
      setRouting(null)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del('/api/capture', { id })
    },
    onSuccess: () => invalidateCapture(),
  })

  const deleteItem = async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }

  const unrouted = displayItems.filter(i => !i.routed_to)
  const routed = displayItems.filter(i => i.routed_to)

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Lightning size={20} style={{ color: 'var(--gold)' }} />
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Quick Capture
          </h1>
          {!isLoading && unrouted.length > 0 && (
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
            aria-label="Capture thought"
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
              background: input.trim() && !submitting ? 'var(--accent-solid)' : 'var(--bg-panel)',
              color: input.trim() && !submitting ? 'var(--text-on-color)' : 'var(--text-muted)',
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
      <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <SkeletonList count={3} lines={3} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayItems.length === 0 && (
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
                    border: '1px solid var(--gold-a25)',
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
                        <Trash size={13} />
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
                          e.currentTarget.style.background = 'var(--purple-a12)'
                          e.currentTarget.style.color = 'var(--accent-bright)'
                          e.currentTarget.style.borderColor = 'var(--purple-a30)'
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
                    border: '1px solid var(--hover-bg)',
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
                          background: 'var(--secondary-a12)',
                          color: 'var(--secondary)',
                          border: '1px solid var(--secondary-a20)',
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
                        <Trash size={13} />
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
    </div>
  )
}
