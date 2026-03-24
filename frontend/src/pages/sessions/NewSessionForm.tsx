import { useState, useCallback } from 'react'
import type { CreateSessionPayload } from './types'

interface NewSessionFormProps {
  onSubmit: (payload: CreateSessionPayload) => void
  onCancel: () => void
  isSubmitting: boolean
  available: boolean
}

export function NewSessionForm({ onSubmit, onCancel, isSubmitting, available }: NewSessionFormProps) {
  const [task, setTask] = useState('')
  const [label, setLabel] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [model, setModel] = useState('')

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!task.trim()) return
    const payload: CreateSessionPayload = { task: task.trim() }
    if (label.trim()) payload.label = label.trim()
    if (workingDir.trim()) payload.workingDir = workingDir.trim()
    if (model.trim()) payload.model = model.trim()
    onSubmit(payload)
    setTask('')
    setLabel('')
    setWorkingDir('')
    setModel('')
  }, [task, label, workingDir, model, onSubmit])

  const disabled = !task.trim() || isSubmitting || !available

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <textarea
        aria-label="Task description"
        placeholder="Describe the task..."
        value={task}
        onChange={(e) => setTask(e.target.value)}
        maxLength={2000}
        rows={3}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          resize: 'vertical',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      <input
        type="text"
        aria-label="Label"
        placeholder="Label (e.g. code-review, test-runner)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      <input
        type="text"
        aria-label="Working directory"
        placeholder="/path/to/project"
        value={workingDir}
        onChange={(e) => setWorkingDir(e.target.value)}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      <input
        type="text"
        aria-label="Model"
        placeholder="e.g. opus, sonnet"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'inherit',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
          className="hover-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: '1px solid var(--accent)',
            background: disabled ? 'var(--hover-bg)' : 'var(--accent)',
            color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            transition: 'background 0.15s, opacity 0.15s',
          }}
        >
          {isSubmitting ? 'Starting...' : 'Start Session'}
        </button>
      </div>
    </form>
  )
}
