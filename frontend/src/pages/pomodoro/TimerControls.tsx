import { useState } from 'react'
import { Play, Pause, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import type { Mode } from './types'
import { MODE_LABELS } from './types'

interface TimerControlsProps {
  running: boolean
  setRunning: React.Dispatch<React.SetStateAction<boolean>>
  completionPrompt: boolean
  durations: Record<Mode, number>
  accentColor: string
  onReset: () => void
  onDurationChange: (m: Mode, val: number) => void
}

export default function TimerControls({
  running,
  setRunning,
  completionPrompt,
  durations,
  accentColor,
  onReset,
  onDurationChange,
}: TimerControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      {/* Controls */}
      {!completionPrompt && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '4px', flexShrink: 0 }}>
          <button
            onClick={onReset}
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
              background: accentColor, color: 'var(--text-on-color)', fontSize: '13px',
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
                  onChange={e => onDurationChange(m, parseInt(e.target.value) || 1)}
                  aria-label={`${MODE_LABELS[m]} duration in minutes`}
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
    </>
  )
}
