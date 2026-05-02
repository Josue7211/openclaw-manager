import { ArrowsOutCardinal, Database, Lightning, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import {
  isInstallableModuleProposal,
  type ModuleProposal,
} from '@/lib/module-proposals'

interface ModuleProposalPreviewProps {
  proposal: ModuleProposal | null
  isFallback?: boolean
}

export function ModuleProposalPreview({
  proposal,
  isFallback = false,
}: ModuleProposalPreviewProps) {
  if (!proposal) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <Sparkle size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={headerLabelStyle}>Module Proposal</span>
        </div>
        <div style={emptyStyle}>Waiting for a structured proposal.</div>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={headerTitleGroupStyle}>
          <Sparkle size={14} style={{ color: 'var(--purple-a11, var(--accent))' }} />
          <span style={headerLabelStyle}>Module Proposal</span>
          {isFallback && <span style={legacyBadgeStyle}>Legacy Fallback</span>}
        </div>
        <div style={metaBadgeRowStyle}>
          <Badge label={proposal.category} />
          <Badge label={`${proposal.targetType} -> ${proposal.installTarget}`} />
          <Badge label={isInstallableModuleProposal(proposal) ? 'Installable' : 'Preview only'} />
        </div>
      </div>

      <div style={bodyStyle}>
        <div style={heroStyle}>
          <div style={titleRowStyle}>
            <h3 style={titleStyle}>{proposal.title}</h3>
            <span style={layoutBadgeStyle}>
              <ArrowsOutCardinal size={12} />
              {proposal.layout.w} x {proposal.layout.h}
            </span>
          </div>
          <p style={descriptionStyle}>{proposal.description}</p>
          {proposal.userIntent && (
            <div style={intentStyle}>
              <span style={sectionOverlineStyle}>User Intent</span>
              <span>{proposal.userIntent}</span>
            </div>
          )}
        </div>

        <div style={gridStyle}>
          <Section
            icon={<ShieldCheck size={14} />}
            label="Capabilities"
            empty="No capabilities declared."
            items={proposal.capabilities}
          />
          <Section
            icon={<Database size={14} />}
            label="Data Requirements"
            empty="No data requirements declared."
            items={proposal.dataRequirements.map(requirement => {
              const bits = [requirement.source, requirement.shape]
              if (requirement.query) bits.push(requirement.query)
              return `${requirement.key}: ${bits.join(' • ')}`
            })}
          />
          <Section
            icon={<Lightning size={14} />}
            label="Actions"
            empty="No actions declared."
            items={proposal.actions.map(action => {
              const bits: string[] = [action.type]
              if (action.target) bits.push(action.target)
              if (action.capability) bits.push(action.capability)
              return `${action.label}: ${bits.join(' • ')}`
            })}
          />
          <Section
            icon={<Database size={14} />}
            label="Backend Contract"
            empty="No backend contract requested."
            items={
              proposal.backendContract?.requested
                ? [
                    proposal.backendContract.summary,
                    ...(proposal.backendContract.models ?? []).map(model => `model ${model.name}`),
                    ...(proposal.backendContract.queries ?? []).map(query => `query ${query.name}`),
                    ...(proposal.backendContract.mutations ?? []).map(
                      mutation => `mutation ${mutation.name}`,
                    ),
                  ]
                : []
            }
          />
        </div>
      </div>
    </div>
  )
}

function Section({
  icon,
  label,
  items,
  empty,
}: {
  icon: React.ReactNode
  label: string
  items: string[]
  empty: string
}) {
  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionIconStyle}>{icon}</span>
        <span style={sectionTitleStyle}>{label}</span>
      </div>
      {items.length > 0 ? (
        <div style={pillListStyle}>
          {items.map(item => (
            <span key={item} style={pillStyle}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div style={sectionEmptyStyle}>{empty}</div>
      )}
    </section>
  )
}

function Badge({ label }: { label: string }) {
  return <span style={badgeStyle}>{label}</span>
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
  gap: '12px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  background: 'var(--bg-elevated)',
  flexWrap: 'wrap',
}

const headerTitleGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
}

const headerLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const metaBadgeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const legacyBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '2px 8px',
}

const bodyStyle: React.CSSProperties = {
  padding: '14px 14px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const heroStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '18px',
  lineHeight: 1.2,
  color: 'var(--text-primary)',
}

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}

const intentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
  background: 'var(--bg-card)',
  borderRadius: '10px',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
  fontSize: '12px',
  color: 'var(--text-secondary)',
}

const sectionOverlineStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const layoutBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  borderRadius: '999px',
  background: 'var(--hover-bg)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  border: '1px solid var(--border)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '10px',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: '10px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
}

const sectionIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-muted)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const pillListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  padding: '6px 8px',
  borderRadius: '8px',
  background: 'var(--hover-bg)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  lineHeight: 1.4,
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
}

const sectionEmptyStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  background: 'var(--hover-bg)',
  border: '1px solid var(--border)',
}

const emptyStyle: React.CSSProperties = {
  padding: '18px 14px',
  fontSize: '13px',
  color: 'var(--text-muted)',
}
