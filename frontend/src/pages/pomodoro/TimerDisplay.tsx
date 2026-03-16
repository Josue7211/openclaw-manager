import { useRef, useState } from 'react'
import { CheckCircle2, Pencil } from 'lucide-react'
import type { Mode } from './types'
import { MODE_LABELS } from './types'

interface TimerDisplayProps {
  mode: Mode
  secondsLeft: number
  setSecondsLeft: (s: number) => void
  secondsLeftRef: React.MutableRefObject<number>
  running: boolean
  durations: Record<Mode, number>
  completionPrompt: boolean
  focusText: string
  pomodoroCount: number
  accentBright: string
  accentBorder: string
  accentColor: string
  onCompletionYes: () => void
  onCompletionNo: () => void
}

export default function TimerDisplay({
  mode,
  secondsLeft,
  setSecondsLeft,
  secondsLeftRef,
  running,
  durations,
  completionPrompt,
  focusText,
  pomodoroCount,
  accentBright,
  accentBorder,
  accentColor,
  onCompletionYes,
  onCompletionNo,
}: TimerDisplayProps) {
  const [editingTime, setEditingTime] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [hoveringTimer, setHoveringTimer] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const totalSecs = durations[mode] * 60
  const progress = totalSecs > 0 ? (totalSecs - secondsLeft) / totalSecs : 0
  const isWork = mode === 'work'
  const nextPomodoro = (pomodoroCount % 4) + 1

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
    let totalSecsEdit: number
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0
      const secs = parseInt(parts[1]) || 0
      totalSecsEdit = mins * 60 + Math.min(59, secs)
    } else {
      totalSecsEdit = (parseInt(trimmed) || 0) * 60
    }
    totalSecsEdit = Math.max(1, Math.min(5940, totalSecsEdit))
    setSecondsLeft(totalSecsEdit)
    secondsLeftRef.current = totalSecsEdit
  }

  return (
    <div style={{
      textAlign: 'center', padding: '6px 24px',
      background: 'var(--bg-base)', borderRadius: '12px',
      border: `1px solid ${completionPrompt ? 'var(--yellow-bright-a35)' : accentBorder}`,
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
              padding: '8px 12px', background: 'var(--purple-a08)',
              borderRadius: '8px', border: '1px solid var(--purple-a15)',
            }}>
              {focusText}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={onCompletionYes}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '9px 20px', borderRadius: '8px', border: 'none',
                background: 'var(--green)', color: 'var(--text-on-color)', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              <CheckCircle2 size={14} />
              Yes, done!
            </button>
            <button
              onClick={onCompletionNo}
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
                aria-label="Edit timer duration"
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
  )
}
