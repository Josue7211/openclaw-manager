import { useRef, useEffect } from 'react'
import { formatHour, formatTimeMs } from '@/lib/utils'
import type { CronJob } from './types'
import {
  COLORS,
  DAY_NAMES,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  getFireTimesInWeek,
  type FireTime,
} from './types'

type DayFire = { job: CronJob; jobIndex: number; fire: FireTime }

interface WeekGridProps {
  gridJobs: CronJob[]
  allJobs: CronJob[]
  weekStart: Date
  isCurrentWeek: boolean
  todayDow: number
  weekDays: Date[]
  now: Date
  loading: boolean
  onJobClick?: (job: CronJob) => void
}

export function WeekGrid({ gridJobs, allJobs, weekStart, isCurrentWeek, todayDow, weekDays, now, loading, onJobClick }: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && scrollRef.current) {
      const currentHour = now.getHours() + now.getMinutes() / 60
      scrollRef.current.scrollTop = Math.max(0, currentHour * HOUR_HEIGHT - 200)
    }
  }, [loading, now])

  // Build per-day fire lists
  const dayFires: DayFire[][] = Array.from({ length: 7 }, () => [])
  gridJobs.forEach(job => {
    const ji = allJobs.indexOf(job)
    getFireTimesInWeek(job, weekStart).forEach(fire => {
      dayFires[fire.dayIndex].push({ job, jobIndex: ji, fire })
    })
  })

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const nowTop = (now.getHours() * 60 + now.getMinutes()) // px from top

  return (
    <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0 }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border-strong)', flexShrink: 0 }}>
        <div style={{ borderRight: '1px solid var(--border-strong)' }} />
        {weekDays.map((d, i) => {
          const isToday = isCurrentWeek && i === todayDow
          return (
            <div
              key={i}
              style={{
                padding: '10px 8px',
                textAlign: 'center',
                borderRight: i < 6 ? '1px solid var(--border-strong)' : undefined,
                background: isToday ? 'var(--purple-a08)' : undefined,
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: isToday ? 'var(--purple)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {DAY_NAMES[i]}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: isToday ? 'var(--purple)' : 'var(--text-secondary)', marginTop: '2px', lineHeight: 1 }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time body */}
      <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: '580px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', height: `${TOTAL_HEIGHT}px`, position: 'relative' }}>
          {/* Time axis */}
          <div style={{ borderRight: '1px solid var(--border-strong)', position: 'relative' }}>
            {hours.map(h => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: h * HOUR_HEIGHT,
                  left: 0,
                  right: 0,
                  height: HOUR_HEIGHT,
                  borderTop: h > 0 ? '1px solid var(--border-subtle)' : undefined,
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '3px 5px 0',
                }}
              >
                {h > 0 && (
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {formatHour(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {Array.from({ length: 7 }, (_, colIdx) => {
            const isToday = isCurrentWeek && colIdx === todayDow
            const fires = dayFires[colIdx].sort((a, b) => a.fire.top - b.fire.top)

            // Overlap layout: assign horizontal slots
            type Placed = { item: DayFire; col: number; totalCols: number }
            const placed: Placed[] = []

            for (const item of fires) {
              const top = item.fire.top
              const bottom = top + 52
              const occupiedCols = placed
                .filter(p => !(bottom <= p.item.fire.top || top >= p.item.fire.top + 52))
                .map(p => p.col)
              let col = 0
              while (occupiedCols.includes(col)) col++
              placed.push({ item, col, totalCols: 1 })
            }

            // Second pass: set totalCols from max overlapping col
            for (const p of placed) {
              const pTop = p.item.fire.top
              const pBottom = pTop + 52
              const maxCol = placed
                .filter(q => !(pBottom <= q.item.fire.top || pTop >= q.item.fire.top + 52))
                .reduce((m, q) => Math.max(m, q.col + 1), 1)
              p.totalCols = maxCol
            }

            return (
              <div
                key={colIdx}
                style={{
                  position: 'relative',
                  borderRight: colIdx < 6 ? '1px solid var(--border-strong)' : undefined,
                  background: isToday ? 'var(--purple-a08)' : undefined,
                }}
              >
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: h * HOUR_HEIGHT,
                      left: 0,
                      right: 0,
                      height: HOUR_HEIGHT,
                      borderTop: '1px solid var(--border-subtle)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && (
                  <div
                    style={{
                      position: 'absolute',
                      top: nowTop,
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'var(--purple)',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--purple)', marginTop: '-3px', marginLeft: '-1px' }} />
                  </div>
                )}

                {/* Event pills */}
                {placed.map(({ item, col, totalCols }) => {
                  const color = COLORS[item.jobIndex % COLORS.length]
                  const colW = 100 / totalCols
                  return (
                    <div
                      key={`${item.job.id}-${item.fire.ms}`}
                      title={`${item.job.name}\n${formatTimeMs(item.fire.ms)}`}
                      role={onJobClick ? 'button' : undefined}
                      tabIndex={onJobClick ? 0 : undefined}
                      aria-label={onJobClick ? 'Edit ' + item.job.name : undefined}
                      onClick={() => onJobClick?.(item.job)}
                      onKeyDown={onJobClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJobClick(item.job) } } : undefined}
                      style={{
                        position: 'absolute',
                        top: item.fire.top + 2,
                        left: `calc(${col * colW}% + 2px)`,
                        width: `calc(${colW}% - 4px)`,
                        minHeight: '52px',
                        background: `${color}18`,
                        border: `1px solid ${color}44`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: '4px',
                        padding: '4px 5px',
                        overflow: 'hidden',
                        zIndex: 5,
                        boxSizing: 'border-box',
                        cursor: onJobClick ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.3' }}>
                        {item.job.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                        {formatTimeMs(item.fire.ms)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
