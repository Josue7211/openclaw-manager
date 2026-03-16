import { useEffect, useRef, useState, useCallback } from 'react'
import { Target } from 'lucide-react'
import type { Mode, SessionEntry } from './pomodoro/types'
import {
  DEFAULT_DURATIONS, MODE_LABELS, CELL_SIZE_STORAGE_KEY,
  playChime, loadSessions, saveSessions,
} from './pomodoro/types'
import TimerDisplay from './pomodoro/TimerDisplay'
import TimerControls from './pomodoro/TimerControls'
import ActivityHeatmap from './pomodoro/ActivityHeatmap'
import SessionSidebar from './pomodoro/SessionSidebar'

export default function PomodoroPage() {
  const [durations, setDurations] = useState<Record<Mode, number>>(DEFAULT_DURATIONS)
  const [mode, setMode] = useState<Mode>('work')
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATIONS.work * 60)
  const [running, setRunning] = useState(false)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [mounted, setMounted] = useState(false)

  // Focus task state
  const [focusText, setFocusText] = useState('')
  const [completionPrompt, setCompletionPrompt] = useState(false)

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
    // Clear old zoom preference — cells now auto-fill height
    try { localStorage.removeItem(CELL_SIZE_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

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
    setMode(m)
    setSecondsLeft(durations[m] * 60)
  }

  const handleReset = () => {
    setRunning(false)
    setCompletionPrompt(false)
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

  const isWork = mode === 'work'
  const accentColor = isWork ? 'var(--accent)' : 'var(--green)'
  const accentBright = isWork ? 'var(--accent-bright)' : 'var(--green-400)'
  const accentBg = isWork ? 'var(--purple-a12)' : 'rgba(59,165,92,0.12)'
  const accentBorder = isWork ? 'var(--border-accent)' : 'rgba(59,165,92,0.25)'

  return (
    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* Left column ~75% */}
      <div style={{ flex: '3 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', gap: '12px', overflow: 'hidden', minHeight: 0 }}>

        {/* Timer section: 50% of height */}
        <div style={{
          background: 'var(--bg-panel)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '10px 16px', flex: '1 1 0', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minHeight: 0,
        }}>
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

            {/* Timer display */}
            <TimerDisplay
              mode={mode}
              secondsLeft={secondsLeft}
              setSecondsLeft={setSecondsLeft}
              secondsLeftRef={secondsLeftRef}
              running={running}
              durations={durations}
              completionPrompt={completionPrompt}
              focusText={focusText}
              pomodoroCount={pomodoroCount}
              accentBright={accentBright}
              accentBorder={accentBorder}
              accentColor={accentColor}
              onCompletionYes={handleCompletionYes}
              onCompletionNo={handleCompletionNo}
            />

            {/* Timer controls + settings */}
            <TimerControls
              running={running}
              setRunning={setRunning}
              completionPrompt={completionPrompt}
              durations={durations}
              accentColor={accentColor}
              onReset={handleReset}
              onDurationChange={handleDurationChange}
            />
          </div>
        </div>

        {/* Activity Heatmap - 50% of height */}
        <ActivityHeatmap sessions={sessions} mounted={mounted} />

      </div>

      {/* Right column ~25% */}
      <SessionSidebar
        sessions={sessions}
        mounted={mounted}
        focusText={focusText}
        setFocusText={setFocusText}
        onClearSessions={clearSessions}
      />
    </div>
  )
}
