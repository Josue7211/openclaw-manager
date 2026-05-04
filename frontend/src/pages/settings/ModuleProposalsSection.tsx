import { memo } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { listModuleProposals, type StoredModuleProposal } from '@/lib/module-proposal-store'
import { queryKeys } from '@/lib/query-keys'
import { sectionLabel } from './shared'

const STATUS_STYLES: Record<string, { fg: string; bg: string; border: string }> = {
  draft: {
    fg: 'var(--amber-500, #f59e0b)',
    bg: 'var(--amber-a08, rgba(245,158,11,0.08))',
    border: 'var(--amber-a30, rgba(245,158,11,0.22))',
  },
  rejected: {
    fg: 'var(--red-500, #ef4444)',
    bg: 'var(--red-a08, rgba(239,68,68,0.08))',
    border: 'var(--red-a30, rgba(239,68,68,0.22))',
  },
  installed: {
    fg: 'var(--green-500, #22c55e)',
    bg: 'var(--green-a08, rgba(34,197,94,0.08))',
    border: 'var(--green-a30, rgba(34,197,94,0.22))',
  },
  approved: {
    fg: 'var(--accent)',
    bg: 'var(--accent-a08)',
    border: 'var(--accent-a20, rgba(91,140,255,0.22))',
  },
}

const ProposalCard = memo(function ProposalCard({ proposal }: { proposal: StoredModuleProposal }) {
  const statusStyle = STATUS_STYLES[proposal.status] ?? STATUS_STYLES.draft

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={titleStyle}>{proposal.title}</div>
          <div style={metaStyle}>
            {proposal.category} • {proposal.targetType} • {proposal.installTarget}
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

      {proposal.description && <div style={descriptionStyle}>{proposal.description}</div>}

      <div style={detailGridStyle}>
        <Detail label="Capabilities" value={String(proposal.proposal.capabilities?.length ?? 0)} />
        <Detail label="Actions" value={String(proposal.proposal.actions?.length ?? 0)} />
        <Detail label="Data" value={String(proposal.proposal.dataRequirements?.length ?? 0)} />
        <Detail
          label="Updated"
          value={new Date(proposal.updatedAt).toLocaleDateString()}
        />
      </div>
    </div>
  )
})

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={detailValueStyle}>{value}</span>
    </div>
  )
}

export function ModuleProposalsSection() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.moduleProposals,
    queryFn: listModuleProposals,
  })

  const proposals = data ?? []

  if (!isLoading && proposals.length === 0) return null

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Sparkle size={14} weight="duotone" />
        Module Proposals
        {proposals.length > 0 && (
          <span style={countStyle}>{proposals.length}</span>
        )}
      </div>

      {isLoading ? (
        <div style={loadingStyle}>Loading proposals...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: '8px',
  padding: '12px',
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary)',
}

const metaStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginTop: '2px',
}

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
}

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '8px',
}

const detailStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  borderRadius: '6px',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const detailValueStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-primary)',
  fontWeight: 600,
}

const statusBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  borderRadius: '999px',
  border: '1px solid transparent',
  padding: '4px 8px',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'capitalize',
}

const countStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '8px',
  background: 'var(--accent-a08)',
  color: 'var(--accent)',
  fontWeight: 600,
  fontFamily: 'monospace',
  textTransform: 'none',
  letterSpacing: 'normal',
}

const loadingStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  padding: '12px 0',
}
