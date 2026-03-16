import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { SessionEntry } from './types'
import { MODE_LABELS, todayStr, toDateKey } from './types'

interface SessionSidebarProps {
  sessions: SessionEntry[]
  mounted: boolean
  focusText: string
  setFocusText: (text: string) => void
  onClearSessions: () => void
}

export default function SessionSidebar({
  sessions,
  mounted,
  focusText,
  setFocusText,
  onClearSessions,
}: SessionSidebarProps) {
  const todaySessions = sessions.filter(s => new Date(s.completedAt).toDateString() === todayStr())

  // Compute stats
  const { weekTotal, monthTotal, streak } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = toDateKey(today)

    // Session map (work sessions only)
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.type !== 'work') continue
      const key = toDateKey(new Date(s.completedAt))
      map[key] = (map[key] || 0) + 1
    }

    // Current Monday
    const dow = today.getDay()
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const startOfWeek = toDateKey(currentMonday)

    let wk = 0
    let mo = 0
    const thisMonth = today.getMonth()
    const thisYear = today.getFullYear()

    for (const [key, count] of Object.entries(map)) {
      const d = new Date(key)
      if (key >= startOfWeek && key <= todayKey) wk += count
      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) mo += count
    }

    // Streak
    let s = 0
    const check = new Date(today)
    if (!map[todayKey]) check.setDate(check.getDate() - 1)
    while (true) {
      const key = toDateKey(check)
      if (!map[key]) break
      s++
      check.setDate(check.getDate() - 1)
    }

    return { weekTotal: wk, monthTotal: mo, streak: s }
  }, [sessions])

  return (
    <div style={{ flex: '1 1 0', minWidth: 0, height: '100%', minHeight: 0 }}>
      <div style={{
        background: 'var(--bg-panel)', borderRadius: '14px', border: '1px solid var(--border)',
        padding: '18px', height: '100%', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxSizing: 'border-box',
      }}>
        {/* FOCUS TASK */}
        <div style={{ marginBottom: '16px', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            Focus Task
          </div>
          <input
            type="text"
            value={focusText}
            onChange={e => setFocusText(e.target.value)}
            placeholder="What are you focusing on?"
            aria-label="Focus task"
            style={{
              width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '9px 12px', fontSize: '13px',
              color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {mounted && (
          <>
            {/* TODAY'S SESSIONS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Today&apos;s Sessions — {todaySessions.length}
              </div>
              {todaySessions.length > 0 && (
                <button
                  onClick={onClearSessions}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent',
                    border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: '2px 4px',
                  }}
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: '16px' }}>
              {todaySessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                  No sessions yet — start the timer
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {todaySessions.map(s => {
                    const isWorkEntry = s.type === 'work'
                    const time = new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 11px', borderRadius: '7px',
                        background: 'var(--bg-base)', border: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: isWorkEntry ? 'var(--accent)' : 'var(--green)', flexShrink: 0,
                          }} />
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                            {MODE_LABELS[s.type]}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {s.duration}m
                          </span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {time}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* STATS */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Stats
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'This Week', value: weekTotal },
                  { label: 'This Month', value: monthTotal },
                  { label: 'Streak', value: `${streak}d` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-bright)', fontFamily: 'monospace' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
