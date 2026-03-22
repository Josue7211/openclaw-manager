import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Play, Stop, ArrowClockwise } from '@phosphor-icons/react'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { Button } from '@/components/ui/Button'
import type { Agent, AgentAction } from './types'

interface AgentDetailPanelProps {
  agent: Agent
  onUpdate: (id: string, fields: Partial<Agent>) => void
  onDelete: (id: string) => void
  onAction: (id: string, action: AgentAction) => void
  openclawHealthy: boolean
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '6px',
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

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: '16px',
}

export function AgentDetailPanel({ agent, onUpdate, onDelete, onAction, openclawHealthy }: AgentDetailPanelProps) {
  const [displayName, setDisplayName] = useState(agent.display_name)
  const [emoji, setEmoji] = useState(agent.emoji)
  const [role, setRole] = useState(agent.role)
  const [model, setModel] = useState(agent.model ?? '')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emojiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state when selected agent changes
  useEffect(() => {
    setDisplayName(agent.display_name)
    setEmoji(agent.emoji)
    setRole(agent.role)
    setModel(agent.model ?? '')
  }, [agent.id, agent.display_name, agent.emoji, agent.role, agent.model])

  const debouncedUpdate = useCallback(
    (field: string, value: string, timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        onUpdate(agent.id, { [field]: value })
      }, 600)
    },
    [agent.id, onUpdate]
  )

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val)
    debouncedUpdate('display_name', val, nameTimerRef)
  }

  const handleEmojiChange = (val: string) => {
    setEmoji(val)
    debouncedUpdate('emoji', val, emojiTimerRef)
  }

  const handleRoleChange = (val: string) => {
    setRole(val)
    debouncedUpdate('role', val, roleTimerRef)
  }

  const handleModelChange = (val: string) => {
    setModel(val)
    debouncedUpdate('model', val, modelTimerRef)
  }

  const active = agent.status === 'active'

  const dialogRef = useFocusTrap(confirmDeleteId !== null)
  const cancelDelete = useCallback(() => setConfirmDeleteId(null), [])
  useEscapeKey(cancelDelete, confirmDeleteId !== null)

  const confirmDelete = () => {
    onDelete(agent.id)
    setConfirmDeleteId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '32px', lineHeight: 1 }}>{agent.emoji}</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {agent.display_name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => onAction(agent.id, 'start')}
            disabled={!openclawHealthy}
            aria-label="Start agent"
            title={openclawHealthy ? 'Start agent' : 'OpenClaw not connected'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: openclawHealthy ? 'pointer' : 'not-allowed',
              opacity: openclawHealthy ? 1 : 0.4,
              transition: 'background 0.15s',
            }}
            className={openclawHealthy ? 'hover-bg' : undefined}
          >
            <Play size={16} />
          </button>
          <button
            type="button"
            onClick={() => onAction(agent.id, 'stop')}
            disabled={!openclawHealthy}
            aria-label="Stop agent"
            title={openclawHealthy ? 'Stop agent' : 'OpenClaw not connected'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: openclawHealthy ? 'pointer' : 'not-allowed',
              opacity: openclawHealthy ? 1 : 0.4,
              transition: 'background 0.15s',
            }}
            className={openclawHealthy ? 'hover-bg' : undefined}
          >
            <Stop size={16} />
          </button>
          <button
            type="button"
            onClick={() => onAction(agent.id, 'restart')}
            disabled={!openclawHealthy}
            aria-label="Restart agent"
            title={openclawHealthy ? 'Restart agent' : 'OpenClaw not connected'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: openclawHealthy ? 'pointer' : 'not-allowed',
              opacity: openclawHealthy ? 1 : 0.4,
              transition: 'background 0.15s',
            }}
            className={openclawHealthy ? 'hover-bg' : undefined}
          >
            <ArrowClockwise size={16} />
          </button>
        </div>
      </div>

      {/* Settings form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {/* Display Name */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            aria-label="Display name"
            style={inputStyle}
          />
        </div>

        {/* Emoji */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Emoji</label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => handleEmojiChange(e.target.value)}
            aria-label="Agent emoji"
            style={{ ...inputStyle, width: '56px', textAlign: 'center' }}
          />
        </div>

        {/* System Name */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>System Name</div>
          <div style={{
            fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-muted)',
            padding: '8px 12px', background: 'var(--bg)', borderRadius: '10px',
            border: '1px solid var(--border)',
          }}>
            {agent.name}
          </div>
        </div>

        {/* Role */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Role</label>
          <input
            type="text"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            aria-label="Agent role"
            style={inputStyle}
          />
        </div>

        {/* Model */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            aria-label="Agent model"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>

        {/* Status */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
              background: active ? 'var(--secondary)' : 'var(--text-muted)',
              animation: active ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: '13px', fontWeight: 600,
              color: active ? 'var(--secondary)' : 'var(--text-muted)',
            }}>
              {agent.status}
            </span>
          </div>
        </div>

        {/* Current Task */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Current Task</div>
          <div style={{
            fontSize: '13px',
            color: agent.current_task ? 'var(--text-secondary)' : 'var(--text-muted)',
            fontStyle: agent.current_task ? 'normal' : 'italic',
          }}>
            {agent.current_task ?? 'No active task'}
          </div>
        </div>

        {/* Created */}
        <div style={fieldGroupStyle}>
          <div style={labelStyle}>Created</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {new Date(agent.created_at).toLocaleString()}
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <Button variant="danger" onClick={() => setConfirmDeleteId(agent.id)}>
            Delete Agent
          </Button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {confirmDeleteId && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--overlay-heavy)',
          }}
          onClick={cancelDelete}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete agent"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-panel)', borderRadius: '12px',
              padding: '24px', width: '380px',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary)' }}>
              Delete Agent
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{agent.display_name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
