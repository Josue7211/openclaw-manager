import { Archive, ArrowRight } from '@phosphor-icons/react'
import type { OpportunityDossier, StageId } from '@/features/career-ops/types'
import { badgeStyle, dossierToTrackedLead, truncate, STAGES } from '@/features/career-ops/domain'

interface OpportunityQueueProps {
  groupedDossiers: Array<{
    id: StageId
    label: string
    blurb: string
    dossiers: OpportunityDossier[]
  }>
  stageFilter: StageId | 'all'
  selectedId: string | null
  onStageFilterChange: (stage: StageId | 'all') => void
  onSelect: (id: string) => void
  onAdvance: (id: string) => void
  onArchive: (id: string) => void
  onRemove: (id: string) => void
}

export function OpportunityQueue({
  groupedDossiers,
  stageFilter,
  selectedId,
  onStageFilterChange,
  onSelect,
  onAdvance,
  onArchive,
  onRemove,
}: OpportunityQueueProps) {
  const visibleGroups = groupedDossiers.filter(stage =>
    stageFilter === 'all' ? stage.dossiers.length > 0 : stage.id === stageFilter,
  )

  return (
    <section
      aria-label="Opportunity queue"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        maxHeight: '58vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: '10px',
        }}
      >
        Opportunity queue
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={() => onStageFilterChange('all')}
          style={{
            padding: '6px 10px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            background: stageFilter === 'all' ? 'var(--accent-a12)' : 'transparent',
            color: stageFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {STAGES.map(stage => (
          <button
            key={stage.id}
            type="button"
            onClick={() => onStageFilterChange(stage.id)}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              background: stageFilter === stage.id ? 'var(--accent-a12)' : 'transparent',
              color: stageFilter === stage.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {stage.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleGroups.length === 0 ? (
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: '1px dashed var(--border)',
              color: 'var(--text-muted)',
              fontSize: '12px',
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            No dossiers yet.
          </div>
        ) : (
          visibleGroups.map(stage => (
            <div
              key={stage.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '10px',
                background: 'var(--bg-base)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '6px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{stage.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    {stage.blurb}
                  </div>
                </div>
                <span style={badgeStyle(stage.id)}>{stage.dossiers.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stage.dossiers.length === 0 ? (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px dashed var(--border)',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      lineHeight: 1.5,
                      textAlign: 'center',
                    }}
                  >
                    No dossiers here yet.
                  </div>
                ) : (
                  stage.dossiers.map(dossier => {
                    const selected = dossier.id === selectedId
                    return (
                      <article
                        key={dossier.id}
                        onClick={() => onSelect(dossier.id)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelect(dossier.id)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${dossier.role} at ${dossier.company}`}
                        aria-pressed={selected}
                        style={{
                          borderRadius: '12px',
                          border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: selected
                            ? 'linear-gradient(180deg, var(--accent-a10) 0%, var(--bg-card) 100%)'
                            : 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-card) 100%)',
                          padding: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '10px',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '14px',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                lineHeight: 1.3,
                              }}
                            >
                              {dossier.role}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              {dossier.company} · {dossier.location}
                            </div>
                          </div>
                          <span style={badgeStyle(dossier.stage, dossierToTrackedLead(dossier).priority)}>
                            {dossier.evaluation.recommendation}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                          <span style={badgeStyle(dossier.stage)}>{dossier.source.label}</span>
                          <span style={badgeStyle(dossier.stage)}>{dossier.due}</span>
                          <span style={badgeStyle(dossier.stage)}>Score {dossier.evaluation.fitScore}</span>
                        </div>

                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.45,
                            marginTop: '8px',
                          }}
                        >
                          {dossier.nextAction}
                        </div>

                        {selected && dossier.notes && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '8px 10px',
                              borderRadius: '10px',
                              background: 'var(--bg-base)',
                              border: '1px solid var(--border)',
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              lineHeight: 1.45,
                            }}
                          >
                            {truncate(dossier.notes, 140)}
                          </div>
                        )}

                        {dossier.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {dossier.tags.slice(0, 3).map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  background: 'var(--bg-base)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '999px',
                                  padding: '3px 8px',
                                }}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              onAdvance(dossier.id)
                            }}
                            disabled={dossier.stage === 'archived'}
                            style={{
                              flex: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '8px 9px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: dossier.stage === 'archived' ? 'var(--bg-base)' : 'var(--accent-a10)',
                              color: dossier.stage === 'archived' ? 'var(--text-muted)' : 'var(--accent)',
                              cursor: dossier.stage === 'archived' ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            Advance
                            <ArrowRight size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              onArchive(dossier.id)
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '8px 9px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            <Archive size={13} />
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              onRemove(dossier.id)
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '8px 9px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
