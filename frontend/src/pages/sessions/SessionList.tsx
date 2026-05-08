import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChatTeardrop, MagnifyingGlass } from '@phosphor-icons/react'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { useSessionMutations } from '@/hooks/sessions/useSessionMutations'
import { GatewayStatusDot } from '@/components/GatewayStatusDot'
import { useHarnessStatus } from '@/hooks/useHarnessStatus'
import { SessionCard } from './SessionCard'

interface SessionListProps {
  selectedId: string | null
  onSelect: (key: string) => void
  onDeleteSelected: (key: string) => void
  title?: string
  headerAction?: ReactNode
}

export function SessionList({ selectedId, onSelect, onDeleteSelected, title = 'Sessions', headerAction }: SessionListProps) {
  const demo = isDemoMode()
  const { sessions, available, isLoading } = useGatewaySessions()
  const { providerLabel, detail } = useHarnessStatus()
  const { renameMutation, deleteMutation, compactMutation } = useSessionMutations()
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = sessions.filter((session) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    const label = String(session.label || '').toLowerCase()
    const agent = String(session.agentKey || '').toLowerCase()
    return label.includes(query) || agent.includes(query) || session.key.toLowerCase().includes(query)
  })

  const sessionToDelete = confirmDeleteKey
    ? sessions.find((s) => s.key === confirmDeleteKey)
    : null
  const deleteLabel = (sessionToDelete?.label as string) || 'Untitled'

  const handleConfirmDelete = () => {
    if (confirmDeleteKey) {
      deleteMutation.mutate(confirmDeleteKey)
      onDeleteSelected(confirmDeleteKey)
      setConfirmDeleteKey(null)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        flexShrink: 0,
        gap: '8px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </span>
        <GatewayStatusDot size={7} />
        {headerAction && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            {headerAction}
          </div>
        )}
      </div>

      <div style={{
        padding: '0 10px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <label style={{
          height: 32,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          color: 'var(--text-muted)',
        }}>
          <MagnifyingGlass size={14} style={{ flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            style={{
              minWidth: 0,
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 12,
            }}
          />
        </label>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        {/* Demo mode banner */}
        {demo && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--blue-a08)',
              border: '1px solid var(--blue-a25)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--blue-solid)' }}>Sessions not configured</span>
            <br />
            Connect a harness in Settings to manage Claude sessions.
          </div>
        )}

        {/* Unreachable banner */}
        {!demo && !available && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'var(--red-500)14',
              border: '1px solid var(--red-500)33',
              color: 'var(--red-500)',
              fontSize: '12px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {detail || `${providerLabel} is unreachable`}
          </div>
        )}

        {/* Loading state — skeleton cards */}
        {isLoading && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  background: 'var(--hover-bg)',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ height: '14px', width: '60%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                <div style={{ height: '12px', width: '40%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: '0.15s' }} />
                <div style={{ height: '12px', width: '50%', borderRadius: '4px', background: 'var(--border)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
              </div>
            ))}
          </>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            color: 'var(--text-muted)',
          }}>
            <ChatTeardrop size={32} weight="thin" />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              No sessions yet
            </div>
            <div style={{ fontSize: '12px', textAlign: 'center' }}>
              Start a new chat to create your first session
            </div>
          </div>
        )}

        {!isLoading && sessions.length > 0 && filteredSessions.length === 0 && (
          <div style={{
            padding: '28px 14px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            textAlign: 'center',
          }}>
            No chats match that search
          </div>
        )}

        {/* Session cards */}
        {filteredSessions.map((session) => (
          <SessionCard
            key={session.key as string}
            session={session}
            selected={session.key === selectedId}
            onSelect={() => onSelect(session.key as string)}
            onRename={(key, label) => renameMutation.mutate({ key, label })}
            onDelete={(key) => setConfirmDeleteKey(key)}
            onCompact={(key) => compactMutation.mutate(key)}
            isCompacting={
              compactMutation.isPending &&
              compactMutation.variables === (session.key as string)
            }
          />
        ))}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDeleteKey && (
        <DeleteConfirmDialog
          label={deleteLabel}
          onCancel={() => setConfirmDeleteKey(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

function DeleteConfirmDialog({
  label,
  onCancel,
  onConfirm,
}: {
  label: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm delete session"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          outline: 'none',
        }}
      >
        <h3 style={{
          margin: '0 0 12px 0',
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          Delete Session
        </h3>
        <p style={{
          margin: '0 0 20px 0',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          Are you sure you want to delete <strong>{label}</strong>? This cannot be undone.
        </p>
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            className="hover-bg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: 'var(--red-500)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
