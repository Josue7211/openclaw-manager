'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Timer, Play, Pause, RotateCcw, ChevronDown, ChevronUp, Trash2, Target, CheckCircle2, Pencil } from 'lucide-react'

type Mode = 'work' | 'short' | 'long'

interface SessionEntry {
  id: string
  completedAt: string
  type: 'work' | 'short' | 'long'
  duration: number
}

interface TodoItem {
  id: string
  text: string
  done: boolean
}

const DEFAULT_DURATIONS: Record<Mode, number> = {
  work: 25,
  short: 5,
  long: 15,
}

const MODE_LABELS: Record<Mode, string> = {
  work: 'Work',
  short: 'Short Break',
  long: 'Long Break',
}

const ZOOM_OPTIONS = [
  { label: '1W', weeks: 1 },
  { label: '1M', weeks: 4 },
  { label: '3M', weeks: 13 },
  { label: '6M', weeks: 26 },
  { label: '1Y', weeks: 52 },
]
const ZOOM_STORAGE_KEY = 'pomodoro-heatmap-zoom'

function playChime(type: 'work' | 'break') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const freqs = type === 'work' ? [523, 659, 784] : [784, 659, 523]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  } catch {
    // Audio not supported — silent fail
  }
}

const STORAGE_KEY = 'pomodoro-sessions'

function loadSessions(): SessionEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveSessions(sessions: SessionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

function todayStr() {
  return new Date().toDateString()
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getHeatColor(count: number): string {
  if (count === 0) return 'var(--bg-elevated)'
  if (count === 1) return 'rgba(155, 132, 236, 0.3)'
  if (count === 2) return 'rgba(155, 132, 236, 0.55)'
  if (count === 3) return 'rgba(155, 132, 236, 0.75)'
  return 'var(--accent-bright)'
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Build heatmap grid: numWeeks columns, Mon–Sun rows
function buildHeatmapGrid(numWeeks: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Monday of current week
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - daysFromMonday)

  const startMonday = new Date(currentMonday)
  startMonday.setDate(currentMonday.getDate() - 7 * (numWeeks - 1))

  const weeks: Date[][] = []
  for (let w = 0; w < numWeeks; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startMonday)
      date.setDate(startMonday.getDate() + w * 7 + d)
      week.push(date)
    }
    weeks.push(week)
  }
  return { today, weeks }
}

const CELL_GAP = 2

export default function PomodoroPage() {
  const [durations, setDurations] = useState<Record<Mode, number>>(DEFAULT_DURATIONS)
  const [mode, setMode] = useState<Mode>('work')
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATIONS.work * 60)
  const [running, setRunning] = useState(false)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [tooltip, setTooltip] = useState<{ key: string; count: number; x: number; y: number } | null>(null)

  // Double-click to edit timer
  const [editingTime, setEditingTime] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [hoveringTimer, setHoveringTimer] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus task state
  const [focusText, setFocusText] = useState('')
  const [completionPrompt, setCompletionPrompt] = useState(false)

  // Heatmap zoom
  const [zoomWeeks, setZoomWeeks] = useState(13)
  const heatmapGridRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const modeRef = useRef(mode)
  const pomodoroCountRef = useRef(pomodoroCount)
  const secondsLeftRef = useRef(secondsLeft)
  const durationsRef = useRef(durations)
  const focusTextRef = useRef('')

  modeRef.current = mode
  pomodoroCountRef.current = pomodoroCount
  secondsLeftRef.current = secondsLeft
  durationsRef.current = durations
  focusTextRef.current = focusText

  useEffect(() => {
    setSessions(loadSessions())
    setMounted(true)
    // Load zoom preference
    try {
      const saved = localStorage.getItem(ZOOM_STORAGE_KEY)
      if (saved) {
        const n = parseInt(saved)
        if (ZOOM_OPTIONS.some(z => z.weeks === n)) setZoomWeeks(n)
      }
    } catch { /* ignore */ }
  }, [])

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

  const handleZoomChange = (weeks: number) => {
    setZoomWeeks(weeks)
    try { localStorage.setItem(ZOOM_STORAGE_KEY, String(weeks)) } catch { /* ignore */ }
  }

  // Keep browser title in sync
  useEffect(() => {
    if (!mounted) return
    const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const ss = String(secondsLeft % 60).padStart(2, '0')
    if (running) {
      document.title = `${mm}:${ss} — ${MODE_LABELS[mode]} · Pomodoro`
    } else {
      document.title = 'Pomodoro · Mission Control'
    }
    return () => { document.title = 'Pomodoro · Mission Control' }
  }, [secondsLeft, running, mode, mounted])

  const advanceMode = useCallback(() => {
    const currentMode = modeRef.current
    const count = pomodoroCountRef.current

    let newEntry: SessionEntry | null = null
    let nextMode: Mode

    if (currentMode === 'work') {
      const newCount = count + 1
      setPomodoroCount(newCount)
      pomodoroCountRef.current = newCount
      newEntry = {
        id: crypto.randomUUID(),
        completedAt: new Date().toISOString(),
        type: 'work',
        duration: durationsRef.current.work,
      }
      playChime('work')
      nextMode = newCount % 4 === 0 ? 'long' : 'short'
    } else {
      newEntry = {
        id: crypto.randomUUID(),
        completedAt: new Date().toISOString(),
        type: currentMode,
        duration: durationsRef.current[currentMode],
      }
      playChime('break')
      nextMode = 'work'
    }

    if (newEntry) {
      setSessions(prev => {
        const updated = [newEntry!, ...prev]
        saveSessions(updated)
        return updated
      })
    }

    setMode(nextMode)
    modeRef.current = nextMode
    const nextSecs = durationsRef.current[nextMode] * 60
    setSecondsLeft(nextSecs)
    secondsLeftRef.current = nextSecs
    setRunning(true)
  }, [])

  const tick = useCallback(() => {
    const next = secondsLeftRef.current - 1
    if (next <= 0) {
      setSecondsLeft(0)
      secondsLeftRef.current = 0
      setRunning(false)
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (modeRef.current === 'work' && focusTextRef.current.trim()) {
        setCompletionPrompt(true)
      } else {
        advanceMode()
      }
    } else {
      setSecondsLeft(next)
      secondsLeftRef.current = next
    }
  }, [advanceMode])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running, tick])

  const handleModeSwitch = (m: Mode) => {
    setRunning(false)
    setCompletionPrompt(false)
    setEditingTime(false)
    setMode(m)
    setSecondsLeft(durations[m] * 60)
  }

  const handleReset = () => {
    setRunning(false)
    setCompletionPrompt(false)
    setEditingTime(false)
    setSecondsLeft(durations[mode] * 60)
  }

  const handleDurationChange = (m: Mode, val: number) => {
    const clamped = Math.max(1, Math.min(99, val))
    setDurations(prev => ({ ...prev, [m]: clamped }))
    durationsRef.current = { ...durationsRef.current, [m]: clamped }
    if (m === mode && !running) {
      setSecondsLeft(clamped * 60)
    }
  }

  const clearSessions = () => {
    setSessions([])
    saveSessions([])
  }

  const handleCompletionYes = () => {
    setFocusText('')
    setCompletionPrompt(false)
    advanceMode()
  }

  const handleCompletionNo = () => {
    setCompletionPrompt(false)
    advanceMode()
  }

  // Double-click timer edit
  const handleTimerDoubleClick = () => {
    if (running || completionPrompt) return
    const curMm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const curSs = String(secondsLeft % 60).padStart(2, '0')
    setEditValue(`${curMm}:${curSs}`)
    setEditingTime(true)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const confirmTimeEdit = () => {
    setEditingTime(false)
    const trimmed = editValue.trim()
    const parts = trimmed.split(':')
    let totalSecs: number
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0
      const secs = parseInt(parts[1]) || 0
      totalSecs = mins * 60 + Math.min(59, secs)
    } else {
      totalSecs = (parseInt(trimmed) || 0) * 60
    }
    totalSecs = Math.max(1, Math.min(5940, totalSecs))
    setSecondsLeft(totalSecs)
    secondsLeftRef.current = totalSecs
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const totalSecs = durations[mode] * 60
  const progress = totalSecs > 0 ? (totalSecs - secondsLeft) / totalSecs : 0

  const isWork = mode === 'work'
  const accentColor = isWork ? 'var(--accent)' : 'var(--green)'
  const accentBright = isWork ? 'var(--accent-bright)' : '#4ade80'
  const accentBg = isWork ? 'rgba(155,132,236,0.12)' : 'rgba(59,165,92,0.12)'
  const accentBorder = isWork ? 'rgba(155,132,236,0.25)' : 'rgba(59,165,92,0.25)'

  const todaySessions = sessions.filter(s => new Date(s.completedAt).toDateString() === todayStr())
  const todayWork = todaySessions.filter(s => s.type === 'work').length
  const nextPomodoro = (pomodoroCount % 4) + 1

  // Heatmap data — build max weeks, slice to visibleWeeks when rendering
  const { today: heatToday, weeks: allWeeks } = buildHeatmapGrid(zoomWeeks)
  const heatTodayKey = toDateKey(heatToday)

  const sessionMap: Record<string, number> = {}
  if (mounted) {
    for (const s of sessions) {
      if (s.type !== 'work') continue
      const key = toDateKey(new Date(s.completedAt))
      sessionMap[key] = (sessionMap[key] || 0) + 1
    }
  }

  // Weekly stats for right column
  const currentMonday = new Date(heatToday)
  const dow = heatToday.getDay()
  currentMonday.setDate(heatToday.getDate() - (dow === 0 ? 6 : dow - 1))
  const startOfWeek = toDateKey(currentMonday)

  let weekTotal = 0
  let monthTotal = 0
  const thisMonth = heatToday.getMonth()
  const thisYear = heatToday.getFullYear()

  for (const [key, count] of Object.entries(sessionMap)) {
    const d = new Date(key)
    if (key >= startOfWeek && key <= heatTodayKey) weekTotal += count
    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) monthTotal += count
  }

  let streak = 0
  const check = new Date(heatToday)
  if (!sessionMap[heatTodayKey]) check.setDate(check.getDate() - 1)
  while (true) {
    const key = toDateKey(check)
    if (!sessionMap[key]) break
    streak++
    check.setDate(check.getDate() - 1)
  }

  // Cell size from height: fit 7 rows + 6 gaps in the grid area (month label already accounted for separately)
  const monthLabelH = 11
  const cellSize = containerHeight > 0
    ? Math.max(4, Math.floor((containerHeight - monthLabelH - 6 * CELL_GAP) / 7))
    : 8
  // Visible weeks: how many columns fit in container width at this cell size
  const visibleWeeks = containerWidth > 0 && cellSize > 0
    ? Math.min(zoomWeeks, Math.max(1, Math.floor(containerWidth / (cellSize + CELL_GAP))))
    : zoomWeeks
  const showMonthLabels = cellSize >= 8

  // Slice to visible weeks and compute month labels
  const weeks = allWeeks.slice(allWeeks.length - visibleWeeks)
  const monthLabels: (string | null)[] = weeks.map((week, i) => {
    const monday = week[0]
    if (i === 0) return MONTH_NAMES[monday.getMonth()]
    const prevMonday = weeks[i - 1][0]
    if (monday.getMonth() !== prevMonday.getMonth()) return MONTH_NAMES[monday.getMonth()]
    return null
  })

  return (
    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* Heatmap tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(20, 18, 30, 0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
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

      {/* ── Left column ~75% ── */}
      <div style={{ flex: '3 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', gap: '12px', overflow: 'hidden', minHeight: 0 }}>

        {/* TOP BOX - Timer section: 50% of height */}
        <div style={{
          background: 'var(--bg-panel)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '10px 16px', flex: '1 1 0', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minHeight: 0,
        }}>
          {/* Make the timer section fill its allocated space */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>

        {/* Focusing on banner */}
        {focusText.trim() && (
          <div style={{
            marginBottom: '8px', padding: '7px 12px', borderRadius: '8px',
            background: accentBg, border: `1px solid ${accentBorder}`,
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.4s', flexShrink: 0,
          }}>
            <Target size={12} style={{ color: accentBright, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Focusing on:</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: accentBright, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {focusText}
            </span>
          </div>
        )}

        {/* Mode tabs */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '6px',
          background: 'var(--bg-base)', borderRadius: '8px', padding: '3px',
          border: '1px solid var(--border)', flexShrink: 0,
        }}>
          {(['work', 'short', 'long'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: '7px', cursor: 'pointer',
                fontSize: '12px', fontWeight: mode === m ? 600 : 400,
                background: mode === m ? accentBg : 'transparent',
                color: mode === m ? accentBright : 'var(--text-muted)',
                transition: 'all 0.25s',
                outline: mode === m ? `1px solid ${accentBorder}` : 'none',
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Timer hero */}
        <div style={{
          textAlign: 'center', padding: '6px 24px',
          background: 'var(--bg-base)', borderRadius: '12px',
          border: `1px solid ${completionPrompt ? 'rgba(250,204,21,0.35)' : accentBorder}`,
          transition: 'border-color 0.4s',
          position: 'relative', overflow: 'hidden',
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 0,
        }}>
          {/* Progress bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, height: '3px',
            width: `${progress * 100}%`, background: accentColor,
            transition: 'width 1s linear, background 0.4s',
            borderRadius: '0 2px 0 0',
          }} />

          {completionPrompt ? (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Work session complete!
              </div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px' }}>
                Did you complete the task?
              </div>
              {focusText.trim() && (
                <div style={{
                  fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px',
                  padding: '8px 12px', background: 'rgba(155,132,236,0.08)',
                  borderRadius: '8px', border: '1px solid rgba(155,132,236,0.15)',
                }}>
                  {focusText}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={handleCompletionYes}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '9px 20px', borderRadius: '8px', border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: '13px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <CheckCircle2 size={14} />
                  Yes, done!
                </button>
                <button
                  onClick={handleCompletionNo}
                  style={{
                    padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px',
                    fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  No, keep going
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Pomodoro count */}
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                {isWork
                  ? `POMODORO ${nextPomodoro} OF 4`
                  : mode === 'long' ? 'LONG BREAK' : 'SHORT BREAK'}
              </div>

              {/* Countdown — double-click to edit when stopped */}
              <div
                style={{ position: 'relative', display: 'inline-block', cursor: running ? 'default' : 'text' }}
                onMouseEnter={() => setHoveringTimer(true)}
                onMouseLeave={() => setHoveringTimer(false)}
                onDoubleClick={handleTimerDoubleClick}
              >
                {editingTime ? (
                  <input
                    ref={editInputRef}
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={confirmTimeEdit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmTimeEdit()
                      if (e.key === 'Escape') setEditingTime(false)
                    }}
                    style={{
                      fontSize: 'clamp(56px, 10vw, 120px)', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-2px',
                      color: accentBright, lineHeight: 1,
                      background: 'transparent', border: 'none', borderBottom: `2px solid ${accentBorder}`,
                      outline: 'none', textAlign: 'center',
                      width: 'clamp(220px, 40vw, 480px)', padding: '0 4px',
                    }}
                  />
                ) : (
                  <div style={{
                    fontSize: 'clamp(56px, 10vw, 120px)', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-2px',
                    color: running ? accentBright : 'var(--text-primary)',
                    transition: 'color 0.4s',
                    lineHeight: 1,
                    userSelect: 'none',
                  }}>
                    {mm}:{ss}
                  </div>
                )}

                {/* Pencil hint on hover (when not running and not editing) */}
                {!running && !editingTime && hoveringTimer && (
                  <div style={{
                    position: 'absolute', top: '8px', right: '-28px',
                    color: 'var(--text-muted)', opacity: 0.6,
                    pointerEvents: 'none',
                  }}>
                    <Pencil size={14} />
                  </div>
                )}
              </div>

              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                {durations[mode]} min · {MODE_LABELS[mode].toLowerCase()}
                {!running && !editingTime && (
                  <span style={{ marginLeft: '8px', opacity: 0.5 }}>· double-click to edit</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        {!completionPrompt && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '4px', flexShrink: 0 }}>
            <button
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px',
                fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <RotateCcw size={13} />
              Reset
            </button>

            <button
              onClick={() => setRunning(r => !r)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 28px', borderRadius: '8px', border: 'none',
                background: accentColor, color: '#fff', fontSize: '13px',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.25s',
                letterSpacing: '0.04em',
              }}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
              {running ? 'Pause' : 'Start'}
            </button>
          </div>
        )}

        {/* Settings panel */}
        <div style={{ marginBottom: '0px', flexShrink: 0 }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent',
              border: 'none', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0',
            }}
          >
            {settingsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            Custom Durations
          </button>

          {settingsOpen && (
            <div style={{
              marginTop: '8px', padding: '10px 12px', background: 'var(--bg-base)',
              borderRadius: '8px', border: '1px solid var(--border)',
              display: 'flex', gap: '16px',
            }}>
              {(['work', 'short', 'long'] as Mode[]).map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {MODE_LABELS[m]}
                  </label>
                  <input
                    type="number"
                    min={1} max={99}
                    value={durations[m]}
                    onChange={e => handleDurationChange(m, parseInt(e.target.value) || 1)}
                    style={{
                      width: '46px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: '5px', padding: '4px 6px', fontSize: '12px',
                      color: 'var(--text-primary)', textAlign: 'center', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>m</span>
                </div>
              ))}
            </div>
          )}
        </div>
          </div>{/* end timer wrapper */}
        </div>{/* end TOP BOX */}

        {/* Activity Heatmap - 50% of height */}
        <div style={{
          background: 'var(--bg-panel)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '14px 16px', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', flex: '1 1 0', minHeight: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexShrink: 0 }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Activity
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              {ZOOM_OPTIONS.map(z => (
                <button
                  key={z.label}
                  onClick={() => handleZoomChange(z.weeks)}
                  style={{
                    padding: '1px 5px', borderRadius: '3px',
                    border: zoomWeeks === z.weeks ? '1px solid rgba(155,132,236,0.5)' : '1px solid transparent',
                    background: zoomWeeks === z.weeks ? 'rgba(155,132,236,0.18)' : 'transparent',
                    color: zoomWeeks === z.weeks ? 'var(--accent-bright)' : 'var(--text-muted)',
                    fontSize: '8px', fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'monospace', letterSpacing: '0.04em',
                    transition: 'all 0.15s',
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={heatmapGridRef} style={{ flex: 1, overflow: 'hidden', width: '100%' }}>
            <div style={{ display: 'flex', gap: `${CELL_GAP}px` }}>
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: `${CELL_GAP}px`,
                    width: `${cellSize}px`, flexShrink: 0,
                  }}
                >
                  <div style={{
                    height: showMonthLabels ? '11px' : '0px',
                    overflow: 'hidden', fontSize: '8px',
                    color: 'var(--text-muted)', fontFamily: 'monospace',
                    whiteSpace: 'nowrap', userSelect: 'none',
                    lineHeight: '11px', transition: 'height 0.2s',
                  }}>
                    {showMonthLabels ? (monthLabels[wi] || '') : ''}
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
                          transition: 'transform 0.1s, background 0.15s',
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
        </div>{/* end Activity Heatmap */}

      </div>{/* end LEFT column */}

      {/* ── Right column ~25% ── */}
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
                    onClick={clearSessions}
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
    </div>
  )
}
