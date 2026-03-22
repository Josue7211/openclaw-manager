import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Mode, SessionEntry } from '@/pages/pomodoro/types'
import { DEFAULT_DURATIONS, STORAGE_KEY, loadSessions, saveSessions } from '@/pages/pomodoro/types'

interface PomodoroWidgetOptions {
  workDuration?: number
  shortBreak?: number
}

export function usePomodoroWidget(options?: PomodoroWidgetOptions) {
  const durations: Record<Mode, number> = {
    work: options?.workDuration ?? DEFAULT_DURATIONS.work,
    short: options?.shortBreak ?? DEFAULT_DURATIONS.short,
    long: DEFAULT_DURATIONS.long,
  }
  const [mode, setMode] = useState<Mode>('work')
  const [secondsLeft, setSecondsLeft] = useState(durations.work * 60)
  const [running, setRunning] = useState(false)
  const [sessionVersion, setSessionVersion] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const durationsRef = useRef(durations)
  durationsRef.current = durations

  // Load today's completed work session count from localStorage
  const todayCount = useMemo(() => {
    // sessionVersion dependency forces re-computation after a session completes
    void sessionVersion
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return 0
      const sessions: SessionEntry[] = JSON.parse(raw)
      const today = new Date().toISOString().slice(0, 10)
      return sessions.filter(s => s.completedAt.startsWith(today) && s.type === 'work').length
    } catch {
      return 0
    }
  }, [sessionVersion])

  // Timer interval
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Session complete
          setRunning(false)

          // Save completed session to localStorage
          const entry: SessionEntry = {
            id: crypto.randomUUID(),
            completedAt: new Date().toISOString(),
            type: mode,
            duration: durationsRef.current[mode],
          }
          const sessions = loadSessions()
          sessions.push(entry)
          saveSessions(sessions)
          setSessionVersion(v => v + 1)

          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [running, mode])

  // Update timer when mode or durations change (only if not running)
  useEffect(() => {
    if (!running) {
      setSecondsLeft(durations[mode] * 60)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, running, durations.work, durations.short, durations.long])

  const toggle = useCallback(() => setRunning(r => !r), [])

  const reset = useCallback(() => {
    setRunning(false)
    setSecondsLeft(durationsRef.current[mode] * 60)
  }, [mode])

  return { mode, setMode, secondsLeft, running, todayCount, toggle, reset, mounted: true }
}
