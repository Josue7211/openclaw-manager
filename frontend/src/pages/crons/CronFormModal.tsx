import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { Button } from '@/components/ui/Button'
import type { CronJob, CronSchedule } from './types'

interface CronFormModalProps {
  job?: CronJob
  onSave: (data: { name: string; description?: string; schedule: CronSchedule }) => void
  onClose: () => void
}

const SCHEDULE_PRESETS = [
  { key: 'every-5m', label: 'Every 5 minutes', schedule: { kind: 'every', everyMs: 300_000 } },
  { key: 'every-15m', label: 'Every 15 minutes', schedule: { kind: 'every', everyMs: 900_000 } },
  { key: 'every-30m', label: 'Every 30 minutes', schedule: { kind: 'every', everyMs: 1_800_000 } },
  { key: 'every-1h', label: 'Every hour', schedule: { kind: 'every', everyMs: 3_600_000 } },
  { key: 'every-2h', label: 'Every 2 hours', schedule: { kind: 'every', everyMs: 7_200_000 } },
  { key: 'every-6h', label: 'Every 6 hours', schedule: { kind: 'every', everyMs: 21_600_000 } },
  { key: 'every-12h', label: 'Every 12 hours', schedule: { kind: 'every', everyMs: 43_200_000 } },
  { key: 'every-24h', label: 'Every day', schedule: { kind: 'every', everyMs: 86_400_000 } },
  { key: 'custom', label: 'Custom (cron expression)', schedule: null },
] as const

function resolvePresetKey(job?: CronJob): string {
  if (!job) return 'every-1h'
  const s = job.schedule
  if (s.kind === 'every' && s.everyMs) {
    const match = SCHEDULE_PRESETS.find(
      p => p.schedule && p.schedule.kind === 'every' && p.schedule.everyMs === s.everyMs
    )
    return match ? match.key : 'custom'
  }
  return 'custom'
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export function CronFormModal({ job, onSave, onClose }: CronFormModalProps) {
  const [name, setName] = useState(job?.name ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [schedulePreset, setSchedulePreset] = useState(() => resolvePresetKey(job))
  const [customExpr, setCustomExpr] = useState(job?.schedule.expr ?? '')

  useEscapeKey(onClose)
  const dialogRef = useFocusTrap(true)

  const canSave =
    name.trim() !== '' &&
    (schedulePreset !== 'custom' || customExpr.trim() !== '')

  const handleSave = () => {
    if (!canSave) return
    const preset = SCHEDULE_PRESETS.find(p => p.key === schedulePreset)
    const schedule: CronSchedule =
      preset && preset.schedule
        ? { kind: preset.schedule.kind, everyMs: preset.schedule.everyMs }
        : { kind: 'cron', expr: customExpr.trim() }
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      schedule,
    })
  }

  const isEdit = !!job

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--overlay-heavy)',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit cron job' : 'Create cron job'}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          borderRadius: '12px',
          padding: '24px',
          width: '420px',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit Cron Job' : 'New Cron Job'}
        </h3>

        {/* Name input */}
        <input
          aria-label="Job name"
          placeholder="e.g. health-check"
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />

        {/* Description input */}
        <input
          aria-label="Description"
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, marginTop: '10px' }}
        />

        {/* Schedule section */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Schedule
          </div>
          <select
            aria-label="Schedule preset"
            value={schedulePreset}
            onChange={e => setSchedulePreset(e.target.value)}
            style={inputStyle}
          >
            {SCHEDULE_PRESETS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          {schedulePreset === 'custom' && (
            <input
              aria-label="Cron expression"
              placeholder="0 0 * * *"
              value={customExpr}
              onChange={e => setCustomExpr(e.target.value)}
              style={{ ...inputStyle, marginTop: '8px', fontFamily: 'monospace' }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
