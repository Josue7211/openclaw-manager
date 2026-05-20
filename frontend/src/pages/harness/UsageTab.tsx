import { useMemo } from 'react'
import { useCodexLbUsage } from '@/hooks/useCodexLbUsage'
import { useBudgetAlerts } from '@/hooks/useBudgetAlerts'
import BudgetSection from './BudgetSection'
import type { UsageData, ModelUsage } from './types'
import type { HarnessHealthStatus } from '../Harness'
import {
  formatCodexUsageCost,
  formatCodexUsageNumber,
  formatCodexUsagePercent,
  formatCodexUsageReset,
  type CodexLbUsageAccount,
  type CodexLbUsageSummary,
} from '@/lib/codex-lb-usage'

function OfflineState({ status, noun }: { status: HarnessHealthStatus; noun: string }) {
  const title = status === 'not_configured' ? 'Harness not configured' : 'Harness offline'
  const detail = status === 'not_configured'
    ? `Set HARNESS_API_URL in Settings > Connections to view ${noun}.`
    : `clawctrl cannot reach the harness right now. Check the upstream service and try again.`

  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>
        {title}
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
        {detail}
      </p>
    </div>
  )
}

export default function UsageTab({ healthy, status = 'unknown' }: { healthy: boolean; status?: HarnessHealthStatus }) {
  if (!healthy) {
    return <OfflineState status={status} noun="usage data" />
  }

  return <UsageContent />
}

function UsageContent() {
  const { rawUsage, usage, loading } = useCodexLbUsage()
  const { alert } = useBudgetAlerts(rawUsage ?? null)

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  if (!usage) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No usage data available</span>
      </div>
    )
  }

  const models = rawUsage?.models

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '20px' }}>
      {/* Budget alert banner */}
      {alert && (
        <BudgetAlert level={alert.level} message={alert.message} />
      )}

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <StatCard label="Used" value={formatCodexUsageNumber(usage.used ?? usage.totalTokens)} />
        <StatCard label="Remaining" value={formatCodexUsageNumber(usage.remaining)} />
        <StatCard label="Total Cost" value={formatCodexUsageCost(usage.totalCost)} />
        <StatCard label="Period" value={usage.period ?? 'All time'} />
      </div>

      <CodexLbLimitSummary usage={usage} />

      {/* Daily usage chart */}
      <DailyChart daily={rawUsage?.daily} />

      {usage.accounts.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', marginTop: 0 }}>
            Codex LB Accounts
          </h3>
          <AccountTable accounts={usage.accounts} />
        </div>
      )}

      {/* Model breakdown */}
      {Array.isArray(models) && models.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', marginTop: 0 }}>
            Model Usage
          </h3>
          <ModelTable models={models} />
        </div>
      )}

      {/* Budget section */}
      <BudgetSection />
    </div>
  )
}

function CodexLbLimitSummary({ usage }: { usage: CodexLbUsageSummary }) {
  if (usage.windows.length === 0 && !usage.resetAt) return null
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '12px',
      marginBottom: '24px',
    }}>
      {usage.windows.map((window) => (
        <StatCard
          key={window.id}
          label={`${window.label} limit`}
          value={window.limit !== undefined
            ? `${formatCodexUsagePercent(window.percent)} of ${formatCodexUsageNumber(window.limit)}`
            : formatCodexUsagePercent(window.percent)}
        />
      ))}
      {usage.resetAt && <StatCard label="Resets" value={formatCodexUsageReset(usage.resetAt)} />}
    </div>
  )
}

function AccountTable({ accounts }: { accounts: CodexLbUsageAccount[] }) {
  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--hover-bg-bright)',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      {accounts.map((account, index) => (
        <div key={account.id} style={{
          padding: '10px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) 1fr 1fr 1fr',
          gap: '8px',
          alignItems: 'center',
          borderBottom: index < accounts.length - 1 ? '1px solid var(--hover-bg)' : 'none',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.label}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{formatCodexUsageNumber(account.remaining)}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{formatCodexUsageNumber(account.used)}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{formatCodexUsagePercent(account.percent)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Budget Alert Banner ──────────────────────────────────────────────────────

function BudgetAlert({ level, message }: { level: 'amber' | 'red'; message: string }) {
  const bgColor = level === 'red' ? 'var(--red-500)' : 'var(--amber)'
  return (
    <div
      role="alert"
      style={{
        padding: '10px 16px',
        marginBottom: '16px',
        borderRadius: '10px',
        background: bgColor,
        color: '#fff',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  )
}

// ── Daily Usage Chart ────────────────────────────────────────────────────────

function DailyChart({ daily }: { daily?: UsageData['daily'] }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(daily) || daily.length === 0) return null
    const maxTokens = Math.max(...daily.map(d => d.tokens || 0), 1)
    return { items: daily, maxTokens }
  }, [daily])

  if (!chartData) {
    return (
      <div style={{
        padding: '16px 0',
        marginBottom: '24px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        fontStyle: 'italic',
      }}>
        Daily breakdown not available from gateway
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', marginTop: 0 }}>
        Daily Usage
      </h3>
      <div style={{
        background: 'var(--bg-white-03)',
        border: '1px solid var(--hover-bg-bright)',
        borderRadius: '10px',
        padding: '16px',
      }}>
        {/* Bar chart */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          height: '120px',
        }}>
          {chartData.items.map((day) => {
            const heightPct = ((day.tokens || 0) / chartData.maxTokens) * 100
            const dayName = formatDayName(day.date)
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                  gap: '4px',
                }}
              >
                {/* Token count label */}
                <span style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}>
                  {(day.tokens || 0) >= 1000
                    ? `${((day.tokens || 0) / 1000).toFixed(0)}k`
                    : (day.tokens || 0).toLocaleString()}
                </span>
                {/* Bar */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '48px',
                    height: `${Math.max(heightPct, 2)}%`,
                    background: 'var(--accent)',
                    borderRadius: '4px 4px 0 0',
                    minHeight: '2px',
                    transition: 'height 0.3s var(--ease-spring)',
                  }}
                  title={`${dayName}: ${(day.tokens || 0).toLocaleString()} tokens, $${(day.cost || 0).toFixed(4)}`}
                />
                {/* Day label */}
                <span style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                }}>
                  {dayName}
                </span>
              </div>
            )
          })}
        </div>

        {/* Cost summary row */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '1px solid var(--hover-bg)',
        }}>
          {chartData.items.map((day) => (
            <div key={day.date + '-cost'} style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '9px',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
            }}>
              ${(day.cost || 0).toFixed(2)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDayName(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  } catch {
    return dateStr.slice(-2)
  }
}

// ── Model Table with Sparklines ──────────────────────────────────────────────

function ModelTable({ models }: { models: ModelUsage[] }) {
  const maxTokens = useMemo(
    () => Math.max(...models.map(m => m.tokens || 0), 1),
    [models],
  )

  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--hover-bg-bright)',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        padding: '10px 16px',
        display: 'grid',
        gridTemplateColumns: '2fr 80px 1fr 1fr 1fr',
        gap: '8px',
        alignItems: 'center',
        borderBottom: '1px solid var(--hover-bg)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Model</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Share</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Tokens</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Cost</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Requests</span>
      </div>
      {/* Data rows */}
      {models.map((m, i) => {
        const pct = ((m.tokens || 0) / maxTokens) * 100
        return (
          <div key={m.model + i} style={{
            padding: '10px 16px',
            display: 'grid',
            gridTemplateColumns: '2fr 80px 1fr 1fr 1fr',
            gap: '8px',
            alignItems: 'center',
            borderBottom: i < models.length - 1 ? '1px solid var(--hover-bg)' : 'none',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{m.model}</span>
            {/* Sparkline bar */}
            <div style={{
              height: '6px',
              background: 'var(--hover-bg)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--accent)',
                borderRadius: '3px',
                transition: 'width 0.3s var(--ease-spring)',
              }} />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.tokens?.toLocaleString() ?? '--'}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.cost != null ? '$' + m.cost.toFixed(4) : '--'}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'right' }}>{m.requests?.toLocaleString() ?? '--'}</span>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-white-03)',
      border: '1px solid var(--hover-bg-bright)',
      borderRadius: '10px',
      padding: '16px 20px',
    }}>
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '6px',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}>
        {value}
      </div>
    </div>
  )
}
