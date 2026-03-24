import React from 'react'
import { Robot, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useOpenClawModels } from '@/hooks/useOpenClawModels'
import { useGatewaySessions } from '@/hooks/sessions/useGatewaySessions'
import { useOpenClawUsage } from '@/hooks/useOpenClawUsage'
import type { WidgetProps } from '@/lib/widget-registry'

export const OpenClawKpiWidget = React.memo(function OpenClawKpiWidget(_props: WidgetProps) {
  const { models, loading: modelsLoading } = useOpenClawModels()
  const { sessions, isLoading: sessionsLoading } = useGatewaySessions()
  const { usage, loading: usageLoading } = useOpenClawUsage()
  const navigate = useNavigate()

  const loading = modelsLoading || sessionsLoading || usageLoading

  const modelCount = (models?.models ?? models?.data ?? []).length
  const activeSessions = sessions.filter(s => {
    const st = s.status as string
    return st === 'active' || st === 'running' || st === 'connected'
  }).length
  const totalTokens = usage?.total_tokens ?? 0
  const totalCost = usage?.total_cost ?? 0

  const kpis = [
    { label: 'Models', value: modelCount.toString() },
    { label: 'Active Sessions', value: activeSessions.toString() },
    {
      label: 'Tokens Today',
      value: totalTokens >= 1_000_000
        ? `${(totalTokens / 1_000_000).toFixed(1)}M`
        : totalTokens >= 1000
          ? `${(totalTokens / 1000).toFixed(0)}k`
          : totalTokens.toLocaleString(),
    },
    { label: 'Cost Today', value: `$${totalCost.toFixed(2)}` },
  ]

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Robot size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          OpenClaw
        </span>
        {activeSessions > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--green-500)', color: '#fff',
            fontWeight: 600, lineHeight: 1,
          }}>
            {activeSessions} live
          </span>
        )}
      </div>

      {/* KPI grid */}
      {loading ? (
        <SkeletonRows count={2} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          flex: 1,
        }}>
          {kpis.map(kpi => (
            <div
              key={kpi.label}
              style={{
                background: 'var(--bg-white-03)',
                borderRadius: '8px',
                padding: '10px 12px',
                border: '1px solid var(--hover-bg)',
              }}
            >
              <div style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '4px',
                fontWeight: 600,
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View all link */}
      <button
        onClick={() => navigate('/openclaw')}
        aria-label="View OpenClaw details"
        style={{
          display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px',
          paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
          background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
        }}
      >
        View details <ArrowRight size={12} />
      </button>
    </div>
  )
})
