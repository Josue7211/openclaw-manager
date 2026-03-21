/**
 * Approval toolbar for Bjorn-generated modules.
 *
 * Renders Approve / Request Changes / Reject buttons below the preview.
 * Only active when generationState is 'previewing'.
 */

import { CheckCircle, PencilSimple, X } from '@phosphor-icons/react'
import type { BjornGenerationState } from '@/lib/bjorn-types'

interface BjornApprovalBarProps {
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  disabled: boolean
  generationState: BjornGenerationState
}

export function BjornApprovalBar({
  onApprove,
  onReject,
  onEdit,
  disabled,
  generationState,
}: BjornApprovalBarProps) {
  const canAct = generationState === 'previewing' && !disabled

  return (
    <div style={barStyle}>
      <button
        onClick={onApprove}
        disabled={!canAct}
        aria-label="Approve module"
        style={{
          ...btnBase,
          background: canAct ? 'var(--green-500, #22c55e)' : 'var(--hover-bg)',
          color: canAct ? 'var(--text-on-color, #fff)' : 'var(--text-muted)',
          cursor: canAct ? 'pointer' : 'default',
        }}
      >
        <CheckCircle size={16} weight="bold" />
        Approve
      </button>

      <button
        onClick={onEdit}
        disabled={!canAct}
        aria-label="Request changes"
        style={{
          ...btnBase,
          background: canAct ? 'var(--hover-bg)' : 'var(--hover-bg)',
          color: canAct ? 'var(--text-primary)' : 'var(--text-muted)',
          border: canAct ? '1px solid var(--border)' : '1px solid transparent',
          cursor: canAct ? 'pointer' : 'default',
        }}
      >
        <PencilSimple size={16} />
        Request Changes
      </button>

      <button
        onClick={onReject}
        disabled={!canAct}
        aria-label="Reject module"
        style={{
          ...btnBase,
          background: canAct ? 'var(--red-a8, rgba(239,68,68,0.08))' : 'var(--hover-bg)',
          color: canAct ? 'var(--red-500, #ef4444)' : 'var(--text-muted)',
          cursor: canAct ? 'pointer' : 'default',
        }}
      >
        <X size={16} weight="bold" />
        Reject
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const barStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '12px',
  background: 'var(--bg-elevated)',
  borderTop: '1px solid var(--border-dim, rgba(255,255,255,0.06))',
  borderRadius: '0 0 12px 12px',
}

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '13px',
  fontWeight: 500,
  fontFamily: 'inherit',
  transition: 'all 0.2s var(--ease-spring)',
}
