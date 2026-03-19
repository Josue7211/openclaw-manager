import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MIN_CELL_SIZE, MAX_CELL_SIZE, CELL_SIZE_STORAGE_KEY, CELL_GAP, MIN_WEEKS, MONTH_NAMES,
  buildHeatmapGrid, toDateKey, getHeatColor,
} from './types'
import type { SessionEntry } from './types'

interface ActivityHeatmapProps {
  sessions: SessionEntry[]
  mounted: boolean
}

export default function ActivityHeatmap({ sessions, mounted }: ActivityHeatmapProps) {
  const [cellSizeTarget, setCellSizeTarget] = useState(MAX_CELL_SIZE)
  const heatmapGridRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [tooltip, setTooltip] = useState<{ key: string; count: number; x: number; y: number } | null>(null)

  // Measure heatmap container dimensions
  useEffect(() => {
    const el = heatmapGridRef.current
    if (!el) return
    const update = () => {
      setContainerWidth(el.offsetWidth)
      setContainerHeight(el.offsetHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleHeatmapWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setCellSizeTarget(prev => {
      const delta = e.deltaY < 0 ? 1 : -1
      const next = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, prev + delta))
      try { localStorage.setItem(CELL_SIZE_STORAGE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  useEffect(() => {
    const el = heatmapGridRef.current
    if (!el) return
    el.addEventListener('wheel', handleHeatmapWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleHeatmapWheel)
  }, [handleHeatmapWheel])

  const monthLabelH = 11
  const maxCellFromHeight = containerHeight > 0
    ? Math.max(MIN_CELL_SIZE, Math.floor((containerHeight - monthLabelH - 6 * CELL_GAP) / 7))
    : MAX_CELL_SIZE
  const maxCellForMinWeeks = containerWidth > 0
    ? Math.max(MIN_CELL_SIZE, Math.floor(containerWidth / MIN_WEEKS) - CELL_GAP)
    : MAX_CELL_SIZE
  const cellSize = Math.min(cellSizeTarget, maxCellFromHeight, maxCellForMinWeeks)
  const visibleWeeks = containerWidth > 0
    ? Math.max(MIN_WEEKS, Math.floor(containerWidth / (cellSize + CELL_GAP)))
    : MIN_WEEKS
  const showMonthLabels = cellSize >= 6

  // Zoom label
  const totalDays = visibleWeeks * 7
  const zoomLabel = totalDays <= 14 ? `${totalDays}d`
    : totalDays <= 56 ? `${Math.round(totalDays / 7)}w`
    : totalDays <= 180 ? `${Math.round(totalDays / 30)}mo`
    : `${(totalDays / 365).toFixed(1)}y`

  const { today: heatToday, weeks: allWeeks } = useMemo(
    () => buildHeatmapGrid(visibleWeeks), [visibleWeeks]
  )
  const heatTodayKey = toDateKey(heatToday)

  const sessionMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (mounted) {
      for (const s of sessions) {
        if (s.type !== 'work') continue
        const key = toDateKey(new Date(s.completedAt))
        map[key] = (map[key] || 0) + 1
      }
    }
    return map
  }, [sessions, mounted])

  const monthLabels: (string | null)[] = allWeeks.map((week, i) => {
    const monday = week[0]
    if (i === 0) return MONTH_NAMES[monday.getMonth()]
    const prevMonday = allWeeks[i - 1][0]
    if (monday.getMonth() !== prevMonday.getMonth()) return MONTH_NAMES[monday.getMonth()]
    return null
  })

  return (
    <>
      {/* Heatmap tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-hover)',
          borderRadius: '6px',
          padding: '5px 8px',
          fontSize: '8px',
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}>
          {tooltip.key} · {tooltip.count} session{tooltip.count !== 1 ? 's' : ''}
        </div>
      )}

      <div style={{
        background: 'var(--bg-panel)', borderRadius: '14px', border: '1px solid var(--border)',
        padding: '14px 16px', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', flex: '1 1 0', minHeight: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Activity
          </div>
          <div style={{
            fontSize: '8px', fontWeight: 700, color: 'var(--accent-bright)',
            fontFamily: 'monospace', letterSpacing: '0.04em',
            padding: '1px 6px', borderRadius: '3px',
            background: 'var(--purple-a12)',
            border: '1px solid var(--purple-a30)',
            transition: 'all 0.3s ease',
            userSelect: 'none',
          }}>
            {zoomLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· scroll to zoom</span>
          </div>
        </div>

        <div ref={heatmapGridRef} style={{ flex: 1, overflow: 'hidden', width: '100%', cursor: 'zoom-in' }}>
          <div style={{
            display: 'flex', gap: `${CELL_GAP}px`,
            justifyContent: 'flex-end',
            transition: 'gap 0.25s ease',
          }}>
            {allWeeks.map((week, wi) => (
              <div
                key={wi}
                style={{
                  display: 'flex', flexDirection: 'column', gap: `${CELL_GAP}px`,
                  width: `${cellSize}px`, flexShrink: 0,
                  transition: 'width 0.25s ease',
                }}
              >
                <div style={{
                  height: showMonthLabels ? '11px' : '0px',
                  overflow: 'hidden', fontSize: '8px',
                  color: 'var(--text-muted)', fontFamily: 'monospace',
                  whiteSpace: 'nowrap', userSelect: 'none',
                  lineHeight: '11px', transition: 'height 0.25s ease, opacity 0.25s ease',
                  opacity: showMonthLabels ? 1 : 0,
                }}>
                  {monthLabels[wi] || ''}
                </div>
                {week.map((date, di) => {
                  const key = toDateKey(date)
                  const count = mounted ? (sessionMap[key] || 0) : 0
                  const isFuture = date > heatToday
                  const isToday = key === heatTodayKey
                  return (
                    <div
                      key={di}
                      onMouseEnter={e => {
                        if (isFuture) return
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setTooltip({ key, count, x: rect.left + rect.width / 2, y: rect.top - 6 })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: `${cellSize}px`, height: `${cellSize}px`,
                        borderRadius: cellSize > 6 ? '2px' : '1px',
                        background: isFuture ? 'var(--bg-elevated)' : getHeatColor(count),
                        opacity: isFuture ? 0.2 : 1,
                        outline: isToday ? '1px solid var(--accent)' : 'none',
                        outlineOffset: '1px',
                        cursor: isFuture ? 'default' : 'pointer',
                        transition: 'width 0.25s ease, height 0.25s ease, transform 0.1s, background 0.15s, border-radius 0.25s ease',
                        flexShrink: 0,
                      }}
                      onMouseOver={e => {
                        if (!isFuture) (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'
                      }}
                      onMouseOut={e => {
                        ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)'
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
