import type { StoredModuleProposal } from '@/lib/module-proposal-store'

interface RecentModuleProposalsProps {
  proposals: StoredModuleProposal[]
  activeProposalId?: string | null
}

const STATUS_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  draft: {
    fg: 'var(--amber-500, #f59e0b)',
    bg: 'var(--amber-a08, rgba(245,158,11,0.08))',
    border: 'var(--amber-a30, rgba(245,158,11,0.2))',
  },
  rejected: {
    fg: 'var(--red-500, #ef4444)',
    bg: 'var(--red-a08, rgba(239,68,68,0.08))',
    border: 'var(--red-a30, rgba(239,68,68,0.2))',
  },
  approved: {
    fg: 'var(--accent)',
    bg: 'var(--accent-a08)',
    border: 'var(--accent-a20, rgba(91,140,255,0.2))',
  },
  installed: {
    fg: 'var(--green-500, #22c55e)',
    bg: 'var(--green-a08, rgba(34,197,94,0.08))',
    border: 'var(--green-a30, rgba(34,197,94,0.2))',
  },
}

export function RecentModuleProposals({
  proposals,
  activeProposalId,
}: RecentModuleProposalsProps) {
  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={headerLabelStyle}>Recent Proposals</span>
        <span style={countStyle}>{proposals.length}</span>
      </div>

      {proposals.length === 0 ? (
        <div style={emptyStyle}>No saved proposals yet.</div>
      ) : (
        <div style={listStyle}>
          {proposals.slice(0, 6).map((proposal) => {
            const statusStyle = STATUS_COLORS[proposal.status] ?? STATUS_COLORS.draft
            const active = proposal.id === activeProposalId
            return (
              <div
                key={proposal.id}
                style={{
                  ...rowStyle,
                  borderColor: active ? 'var(--accent)' : 'var(--border-subtle, rgba(255,255,255,0.06))',
                }}
              >
                <div style={rowMainStyle}>
                  <div style={rowTitleStyle}>{proposal.title}</div>
                  <div style={rowMetaStyle}>
                    {proposal.category} • {proposal.targetType} • {new Date(proposal.updatedAt).toLocaleString()}
                  </div>
                </div>
                <span
                  style={{
                    ...statusBadgeStyle,
                    color: statusStyle.fg,
                    background: statusStyle.bg,
                    borderColor: statusStyle.border,
                  }}
                >
                  {proposal.status}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  background: 'var(--bg-elevated)',
}

const headerLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const countStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '2px 8px',
}

const emptyStyle: React.CSSProperties = {
  padding: '16px 12px',
  color: 'var(--text-muted)',
  fontSize: '13px',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '10px 12px 12px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  borderRadius: '10px',
  background: 'var(--bg-card)',
  padding: '10px 12px',
}

const rowMainStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
}

const rowTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const rowMetaStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const statusBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 8px',
  borderRadius: '999px',
  border: '1px solid transparent',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'capitalize',
}
