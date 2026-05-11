import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Check, X, CaretDown, CaretRight, ArrowsClockwise } from '@phosphor-icons/react'
import { useApprovals } from '@/hooks/useApprovals'
import SecondsAgo from '@/components/SecondsAgo'
import type { ApprovalRequest, ApprovalSourceStatus } from './types'

type RiskFilter = 'all' | 'high' | 'medium' | 'low' | 'unknown'
type AgeFilter = 'all' | 'hour' | 'today' | 'older'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function approvalRisk(approval: ApprovalRequest): RiskFilter {
  const raw = isRecord(approval.raw) ? approval.raw : {}
  const argsRisk = isRecord(approval.args) ? approval.args.risk : undefined
  const rawRisk = raw.risk
  const risk = String(approval.risk ?? argsRisk ?? rawRisk ?? 'unknown').toLowerCase()
  if (risk === 'high' || risk === 'medium' || risk === 'low') return risk
  return 'unknown'
}

function approvalSource(approval: ApprovalRequest) {
  return approval.source || 'harness'
}

function ageMatches(approval: ApprovalRequest, filter: AgeFilter) {
  if (filter === 'all') return true
  const requested = new Date(approval.requestedAt)
  const requestedMs = requested.getTime()
  if (!Number.isFinite(requestedMs)) return filter === 'older'

  const now = new Date()
  if (filter === 'hour') return now.getTime() - requestedMs <= 60 * 60 * 1000
  const sameDay =
    requested.getFullYear() === now.getFullYear()
    && requested.getMonth() === now.getMonth()
    && requested.getDate() === now.getDate()
  if (filter === 'today') return sameDay
  return !sameDay
}

function sourceColor(source: ApprovalSourceStatus) {
  if (!source.configured) return 'var(--text-muted)'
  return source.ok ? 'var(--green-500)' : 'var(--red-500)'
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 30,
        borderRadius: 8,
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 55%, var(--border))' : 'var(--border)'}`,
        background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--surface-bg)',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 12,
        fontWeight: active ? 700 : 600,
        fontFamily: 'inherit',
        padding: '5px 10px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function FilterGroup({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {children}
    </div>
  )
}

function SourceStrip({ sources }: { sources: ApprovalSourceStatus[] }) {
  if (sources.length === 0) return null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 10,
      marginBottom: 18,
    }}>
      {sources.map(source => (
        <div key={source.source} style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          background: 'var(--surface-bg)',
          display: 'grid',
          gap: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: sourceColor(source) }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{source.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {source.ok ? `${source.count ?? 0} pending` : source.configured ? 'Needs attention' : 'Not configured'}
            </span>
          </div>
          {source.error && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {source.error}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--text-primary)',
            background: 'var(--hover-bg)',
            padding: '2px 8px',
            borderRadius: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {approval.tool}
          </span>
          {approval.sourceLabel && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              borderRadius: 999,
              padding: '2px 7px',
              whiteSpace: 'nowrap',
            }}>
              {approval.sourceLabel}
            </span>
          )}
        </div>
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
  const [sourceFilter, setSourceFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all')
  const {
    approvals,
    sources: rawSources,
    isLoading,
    isFetching,
    isError,
    error,
    approve,
    reject,
    isApproving,
    isRejecting,
    refetch,
  } = useApprovals()
  const sources = rawSources ?? []

  const sourceLabels = new Map<string, string>()
  sources.forEach(source => sourceLabels.set(source.source, source.label))
  approvals.forEach(approval => {
    const source = approvalSource(approval)
    if (!sourceLabels.has(source)) sourceLabels.set(source, approval.sourceLabel || source)
  })
  const sourceOptions = Array.from(sourceLabels.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const filteredApprovals = approvals.filter(approval => {
    const sourceOk = sourceFilter === 'all' || approvalSource(approval) === sourceFilter
    const riskOk = riskFilter === 'all' || approvalRisk(approval) === riskFilter
    const ageOk = ageMatches(approval, ageFilter)
    return sourceOk && riskOk && ageOk
  })

  const pending = filteredApprovals.filter(a => a.status === 'pending')
  const resolved = filteredApprovals.filter(a => a.status !== 'pending')
  const totalPending = approvals.filter(a => a.status === 'pending').length
  const sourceErrors = sources.filter(source => !source.ok && source.configured)
  const showQueryError = isError && !sources.some(source => source.ok)
  const filtersActive = sourceFilter !== 'all' || riskFilter !== 'all' || ageFilter !== 'all'

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
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
        {totalPending > 0 && (
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
            {totalPending}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
          {isFetching ? 'Refreshing' : `${sources.length || 0} sources`}
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="icon-button"
          aria-label="Refresh approvals"
        >
          <ArrowsClockwise size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: 24,
      }}>
        <SourceStrip sources={sources} />

        {approvals.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            marginBottom: 18,
          }}>
            <FilterGroup>
              <FilterButton active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
                All sources
              </FilterButton>
              {sourceOptions.map(([source, label]) => (
                <FilterButton
                  key={source}
                  active={sourceFilter === source}
                  onClick={() => setSourceFilter(source)}
                >
                  {label}
                </FilterButton>
              ))}
            </FilterGroup>
            <FilterGroup>
              {(['all', 'high', 'medium', 'low', 'unknown'] as RiskFilter[]).map(risk => (
                <FilterButton
                  key={risk}
                  active={riskFilter === risk}
                  onClick={() => setRiskFilter(risk)}
                >
                  {risk === 'all' ? 'All risk' : risk[0].toUpperCase() + risk.slice(1)}
                </FilterButton>
              ))}
            </FilterGroup>
            <FilterGroup>
              {([
                ['all', 'All ages'],
                ['hour', 'Last hour'],
                ['today', 'Today'],
                ['older', 'Older'],
              ] as Array<[AgeFilter, string]>).map(([age, label]) => (
                <FilterButton
                  key={age}
                  active={ageFilter === age}
                  onClick={() => setAgeFilter(age)}
                >
                  {label}
                </FilterButton>
              ))}
              {filtersActive && (
                <FilterButton
                  active={false}
                  onClick={() => {
                    setSourceFilter('all')
                    setRiskFilter('all')
                    setAgeFilter('all')
                  }}
                >
                  Clear
                </FilterButton>
              )}
            </FilterGroup>
          </div>
        )}

        {showQueryError && (
          <div style={{
            border: '1px solid color-mix(in srgb, var(--red-500) 40%, var(--border))',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: 'var(--text-secondary)',
            background: 'color-mix(in srgb, var(--red-500) 8%, transparent)',
            fontSize: 13,
          }}>
            {error instanceof Error ? error.message : 'Approvals failed to load'}
          </div>
        )}

        {sourceErrors.length > 0 && totalPending === 0 && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: 'var(--text-secondary)',
            background: 'var(--surface-bg)',
            fontSize: 13,
          }}>
            Some approval sources are configured but unreachable. Fix the source above, then refresh.
          </div>
        )}

        {!isLoading && approvals.length > 0 && filteredApprovals.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 240,
            gap: 12,
          }}>
            <ShieldCheck size={40} weight="thin" style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              No approvals match
            </span>
          </div>
        )}

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
              No pending approvals
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12, opacity: 0.7 }}>
              Agent execution and Agent Secrets requests will appear here
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
