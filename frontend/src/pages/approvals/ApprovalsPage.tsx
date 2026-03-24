import { useState, useCallback } from 'react'
import { ShieldCheck, Check, X, CaretDown, CaretRight } from '@phosphor-icons/react'
import { useApprovals } from '@/hooks/useApprovals'
import SecondsAgo from '@/components/SecondsAgo'
import type { ApprovalRequest } from './types'

function ApprovalCard({
  approval,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  approval: ApprovalRequest
  onApprove: (id: string) => void
  onReject: (payload: { id: string; reason?: string }) => void
  isApproving: boolean
  isRejecting: boolean
}) {
  const [argsExpanded, setArgsExpanded] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const isPending = approval.status === 'pending'
  const requestedMs = new Date(approval.requestedAt).getTime()

  const handleReject = useCallback(() => {
    if (!showRejectInput) {
      setShowRejectInput(true)
      return
    }
    onReject({ id: approval.id, reason: rejectReason || undefined })
    setShowRejectInput(false)
    setRejectReason('')
  }, [showRejectInput, onReject, approval.id, rejectReason])

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header row: tool name + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-primary)',
          background: 'var(--hover-bg)',
          padding: '2px 8px',
          borderRadius: 6,
        }}>
          {approval.tool}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <SecondsAgo sinceMs={requestedMs} />
        </span>
      </div>

      {/* Context */}
      {approval.context && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {approval.context}
        </p>
      )}

      {/* Session / agent info */}
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        {approval.sessionId && (
          <span>Session: <span style={{ color: 'var(--text-secondary)' }}>{approval.sessionId.slice(0, 8)}</span></span>
        )}
        {approval.agentId && (
          <span>Agent: <span style={{ color: 'var(--text-secondary)' }}>{approval.agentId}</span></span>
        )}
      </div>

      {/* Collapsible args */}
      {approval.args && Object.keys(approval.args).length > 0 && (
        <div>
          <button
            onClick={() => setArgsExpanded(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
            }}
            aria-expanded={argsExpanded}
            aria-label={argsExpanded ? 'Collapse arguments' : 'Expand arguments'}
          >
            {argsExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
            Arguments
          </button>
          {argsExpanded && (
            <pre style={{
              margin: '8px 0 0',
              padding: 12,
              background: 'var(--hover-bg)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-secondary)',
              overflow: 'auto',
              maxHeight: 200,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {JSON.stringify(approval.args, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Reject reason input */}
      {showRejectInput && (
        <input
          type="text"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Rejection reason (optional)"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') handleReject()
            if (e.key === 'Escape') { setShowRejectInput(false); setRejectReason('') }
          }}
          aria-label="Rejection reason"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Action buttons */}
      {isPending && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => onApprove(approval.id)}
            disabled={isApproving}
            aria-label={`Approve ${approval.tool}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--green-500)',
              color: 'var(--text-on-color)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: isApproving ? 'not-allowed' : 'pointer',
              opacity: isApproving ? 0.6 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <Check size={16} weight="bold" />
            {isApproving ? 'Approving...' : 'Approve'}
          </button>
          <button
            onClick={handleReject}
            disabled={isRejecting}
            aria-label={showRejectInput ? 'Confirm rejection' : `Reject ${approval.tool}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--red-500)',
              color: 'var(--text-on-color)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: isRejecting ? 'not-allowed' : 'pointer',
              opacity: isRejecting ? 0.6 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            <X size={16} weight="bold" />
            {isRejecting ? 'Rejecting...' : showRejectInput ? 'Confirm Reject' : 'Reject'}
          </button>
        </div>
      )}

      {/* Status badge for resolved items */}
      {!isPending && (
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: approval.status === 'approved' ? 'var(--green-500)' : 'var(--red-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {approval.status}
        </div>
      )}
    </div>
  )
}

export default function ApprovalsPage() {
  const { approvals, isLoading, approve, reject, isApproving, isRejecting } = useApprovals()

  const pending = approvals.filter(a => a.status === 'pending')
  const resolved = approvals.filter(a => a.status !== 'pending')

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      margin: '-20px -28px',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <ShieldCheck size={22} weight="bold" style={{ color: 'var(--accent)' }} />
        <h1 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          Approval Queue
        </h1>
        {pending.length > 0 && (
          <span style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            background: 'var(--red-500)',
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
          }}>
            {pending.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: 24,
      }}>
        {isLoading && approvals.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            Loading approvals...
          </div>
        )}

        {!isLoading && approvals.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
          }}>
            <ShieldCheck size={48} weight="thin" style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              No pending approval requests
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, opacity: 0.7 }}>
              Execution requests from agents will appear here
            </span>
          </div>
        )}

        {pending.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending.map(a => (
              <ApprovalCard
                key={a.id}
                approval={a}
                onApprove={approve}
                onReject={reject}
                isApproving={isApproving}
                isRejecting={isRejecting}
              />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div style={{ marginTop: pending.length > 0 ? 32 : 0 }}>
            <h2 style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 12px',
            }}>
              Resolved
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.6 }}>
              {resolved.map(a => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onApprove={approve}
                  onReject={reject}
                  isApproving={isApproving}
                  isRejecting={isRejecting}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
