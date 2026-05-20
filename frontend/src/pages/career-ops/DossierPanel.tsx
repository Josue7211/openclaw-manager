import type { OpportunityDossier } from '@/features/career-ops/types'
import { badgeStyle, formatDate } from '@/features/career-ops/domain'

function renderList(items: string[], empty: string) {
  if (items.length === 0) {
    return <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{empty}</div>
  }

  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: '18px',
        display: 'grid',
        gap: '6px',
        color: 'var(--text-secondary)',
        fontSize: '12px',
        lineHeight: 1.5,
      }}
    >
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function DossierPanel({ dossier }: { dossier: OpportunityDossier | null }) {
  return (
    <section
      aria-label="Dossier detail"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px',
        maxHeight: '48vh',
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
        Dossier detail
      </div>

      {!dossier ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          No dossier selected yet. Pick one from the queue to inspect fit, risks, and tailored assets.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {dossier.company}
                </div>
                <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {dossier.role} · {dossier.location}
                </div>
              </div>
              <span style={badgeStyle(dossier.stage)}>{dossier.stage}</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              <span style={badgeStyle(dossier.stage)}>{dossier.source.label}</span>
              <span style={badgeStyle(dossier.stage)}>{dossier.evaluation.recommendation}</span>
              <span style={badgeStyle(dossier.stage)}>Score {dossier.evaluation.fitScore}</span>
              <span style={badgeStyle(dossier.stage)}>{dossier.due}</span>
            </div>

            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dossier.summary}
            </div>
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-base)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Fit assessment
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Recommendation: {dossier.evaluation.recommendation} with fit score {dossier.evaluation.fitScore}.
            </div>
            <div
              style={{
                marginTop: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '8px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Reasons to pursue
                </div>
                {renderList(dossier.evaluation.reasonsToPursue, 'No explicit reasons captured yet.')}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Reasons to avoid
                </div>
                {renderList(dossier.evaluation.reasonsToAvoid, 'No avoid reasons captured.')}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Risk flags
                </div>
                {renderList(dossier.evaluation.riskFlags, 'No risk flags captured.')}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Confidence gaps
                </div>
                {renderList(dossier.evaluation.confidenceGaps, 'No major confidence gaps captured.')}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-base)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Generated assets
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Resume bullets
                </div>
                {renderList(dossier.assets.resumeBullets, 'No tailored resume bullets yet.')}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Cover note
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {dossier.assets.coverNote || 'No cover note drafted yet.'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Outreach blurb
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {dossier.assets.outreachBlurb || 'No outreach blurb drafted yet.'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Interview prompts
                </div>
                {renderList(dossier.assets.interviewPrompts, 'No interview prompts captured yet.')}
              </div>
              {dossier.assets.callScript ? (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Call or visit script
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {dossier.assets.callScript}
                  </div>
                </div>
              ) : null}
              {dossier.assets.followUpNote ? (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Same-day follow-up
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {dossier.assets.followUpNote}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-base)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Next actions
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dossier.nextAction}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <span style={badgeStyle(dossier.stage)}>Due {dossier.due}</span>
              <span style={badgeStyle(dossier.stage)}>Updated {formatDate(dossier.updatedAt)}</span>
            </div>
            {dossier.notes && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {dossier.notes}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-base)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Timeline
            </div>
            {dossier.timeline.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                No timeline events recorded yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {dossier.timeline.map(event => (
                  <div
                    key={event.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{event.label}</div>
                    <div style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatDate(event.at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
