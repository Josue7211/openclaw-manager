import { useState, useCallback, useEffect } from 'react'
import { Warning, Trash, Clock, BellSlash, CheckCircle } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { api } from '@/lib/api'
import type { StaleItem, ItemType } from './types'
import { STALE_TYPE_COLORS, STALE_TYPE_ICONS } from './types'
import { daysAgo } from './utils'

export function PipelineStale() {
  const [staleItems, setStaleItems] = useState<StaleItem[]>([])
  const [staleLoading, setStaleLoading] = useState(true)
  const [staleActing, setStaleActing] = useState<string | null>(null)

  const fetchStale = useCallback(() => {
    setStaleLoading(true)
    api.get<{ items?: StaleItem[] }>('/api/stale')
      .then(d => setStaleItems(d.items || []))
      .catch(() => {})
      .finally(() => setStaleLoading(false))
  }, [])

  useEffect(() => {
    fetchStale()
  }, [fetchStale])

  const actStale = async (id: string, type: ItemType, action: 'done' | 'snooze' | 'delete') => {
    setStaleActing(`${id}-${action}`)
    try {
      if (action === 'delete') {
        await api.del('/api/stale', { id, type })
      } else {
        await api.patch('/api/stale', { id, type, action })
      }
      setStaleItems(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setStaleActing(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Warning size={16} style={{ color: 'var(--gold)' }} />
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Stale Items</span>
        {!staleLoading && staleItems.length > 0 && (
          <span style={{
            padding: '1px 7px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 600,
            background: 'var(--gold-a12)',
            color: 'var(--gold)',
            border: '1px solid var(--gold-a25)',
          }}>
            {staleItems.length}
          </span>
        )}
      </div>
      {staleLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading stale items...</div>
      ) : staleItems.length === 0 ? (
        <EmptyState icon={CheckCircle} title="All clear" description="No stale items found." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {staleItems.map(item => {
            const days = daysAgo(item.staleSince)
            const title = item.title || item.text || 'Untitled'
            const TypeIcon = STALE_TYPE_ICONS[item.type]
            const colors = STALE_TYPE_COLORS[item.type]
            const staleColor = days > 14 ? 'var(--red)' : days > 7 ? 'var(--gold)' : 'var(--text-muted)'

            return (
              <div
                key={`${item.type}-${item.id}`}
                style={{
                  background: 'var(--bg-panel)',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <TypeIcon size={14} style={{ color: colors.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {title}
                    </span>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: '20px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: colors.bg,
                      color: colors.color,
                      border: `1px solid ${colors.border}`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}>
                      {item.type}
                    </span>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: staleColor }}>
                    <Clock size={10} />
                    {days}d stale
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                  <button
                    onClick={() => actStale(item.id, item.type, 'done')}
                    disabled={staleActing === `${item.id}-done`}
                    title="Mark done"
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'var(--secondary-a15)',
                      color: 'var(--secondary)',
                      opacity: staleActing === `${item.id}-done` ? 0.5 : 1,
                    }}
                  >
                    Done
                  </button>
                  <button
                    onClick={() => actStale(item.id, item.type, 'snooze')}
                    disabled={staleActing === `${item.id}-snooze`}
                    title="Snooze 3 days"
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'var(--gold-a25)',
                      color: 'var(--gold)',
                      opacity: staleActing === `${item.id}-snooze` ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <BellSlash size={10} />
                    3d
                  </button>
                  <button
                    onClick={() => actStale(item.id, item.type, 'delete')}
                    disabled={staleActing === `${item.id}-delete`}
                    title="Delete"
                    aria-label="Delete"
                    style={{
                      padding: '4px 7px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: 'var(--red-a12)',
                      color: 'var(--red)',
                      opacity: staleActing === `${item.id}-delete` ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
