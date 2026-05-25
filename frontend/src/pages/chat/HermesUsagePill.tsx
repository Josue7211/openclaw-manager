import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, ChartLineUp } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useHermesUsage } from '@/hooks/useHermesUsage'
import {
  hermesUsageCompactLabel,
  formatHermesUsageCost,
  formatHermesUsageNumber,
  formatHermesUsagePercent,
  formatHermesUsageReset,
  type HermesUsageAccount,
  type HermesUsageSummary,
  type HermesUsageWindow,
} from '@/lib/hermes-usage'

function statusText({
  loading,
  fetching,
  error,
  fromCache,
}: {
  loading: boolean
  fetching: boolean
  error: Error | null
  fromCache: boolean
}): string {
  if (loading) return 'loading'
  if (error && fromCache) return 'stale'
  if (error) return 'unavailable'
  if (fetching) return 'refreshing'
  if (fromCache) return 'cached'
  return 'live'
}

function usageDetailLine(summary: HermesUsageSummary | null): string {
  if (!summary) return 'No usage data yet'
  if (summary.remaining !== undefined && summary.limit !== undefined) {
    return `${formatHermesUsageNumber(summary.remaining)} remaining of ${formatHermesUsageNumber(summary.limit)}`
  }
  if (summary.used !== undefined && summary.limit !== undefined) {
    return `${formatHermesUsageNumber(summary.used)} used of ${formatHermesUsageNumber(summary.limit)}`
  }
  if (summary.totalTokens !== undefined) return `${formatHermesUsageNumber(summary.totalTokens)} tokens`
  if (summary.totalCost !== undefined) return `${formatHermesUsageCost(summary.totalCost)} total`
  return summary.status ?? 'Usage available'
}

function formatLastUpdated(value: number | null): string {
  if (!value) return 'not updated'
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function WindowMeter({ window }: { window: HermesUsageWindow }) {
  const percent = window.percent ?? 0
  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 76 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
        <span>{window.label}</span>
        <span>{formatHermesUsagePercent(window.percent)}</span>
      </div>
      <div style={{
        height: 4,
        borderRadius: 999,
        background: 'var(--bg-white-06)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          background: percent >= 90 ? 'var(--red)' : percent >= 75 ? 'var(--amber)' : 'var(--accent)',
        }} />
      </div>
    </div>
  )
}

function AccountRow({ account }: { account: HermesUsageAccount }) {
  const fiveHour = account.windows.find((window) => window.id === 'fiveHour')
  const weekly = account.windows.find((window) => window.id === 'weekly')
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: 10,
      alignItems: 'center',
      padding: '8px 0',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {account.label}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
          {account.remaining !== undefined
            ? `${formatHermesUsageNumber(account.remaining)} left`
            : account.used !== undefined
              ? `${formatHermesUsageNumber(account.used)} used`
              : account.status ?? 'Account usage'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {fiveHour && <WindowMeter window={fiveHour} />}
        {weekly && <WindowMeter window={weekly} />}
        {!fiveHour && !weekly && account.percent !== undefined && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'monospace' }}>
            {formatHermesUsagePercent(account.percent)}
          </span>
        )}
      </div>
    </div>
  )
}

function UsagePopover({
  summary,
  loading,
  fetching,
  error,
  fromCache,
  lastUpdatedAt,
  onRefresh,
  onNavigate,
}: {
  summary: HermesUsageSummary | null
  loading: boolean
  fetching: boolean
  error: Error | null
  fromCache: boolean
  lastUpdatedAt: number | null
  onRefresh: () => void
  onNavigate: (path: string) => void
}) {
  const windows = summary?.windows ?? []
  return (
    <div
      role="dialog"
      aria-label="Hermes Agent usage details"
      style={{
        position: 'absolute',
        right: 0,
        bottom: 34,
        zIndex: 35,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        backgroundColor: '#18181f',
        opacity: 1,
        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.34)',
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>Hermes Agent usage</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
            {statusText({ loading, fetching, error, fromCache })} · updated {formatLastUpdated(lastUpdatedAt)}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh Hermes Agent usage"
          title="Refresh Hermes Agent usage"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-secondary)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <ArrowClockwise size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <UsageStat label="Used" value={formatHermesUsageNumber(summary?.used ?? summary?.totalTokens)} />
        <UsageStat label="Remaining" value={formatHermesUsageNumber(summary?.remaining)} />
        <UsageStat label="Cost" value={formatHermesUsageCost(summary?.totalCost)} />
      </div>

      {windows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {windows.map((window) => <WindowMeter key={window.id} window={window} />)}
        </div>
      )}

      {(summary?.period || summary?.resetAt) && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {summary.period ? `Period ${summary.period}` : ''}
          {summary.period && summary.resetAt ? ' · ' : ''}
          {summary.resetAt ? `Resets ${formatHermesUsageReset(summary.resetAt)}` : ''}
        </div>
      )}

      {error && (
        <div role="status" style={{ color: 'var(--amber)', fontSize: 11 }}>
          {fromCache ? 'Showing cached usage while refresh fails.' : 'Hermes Agent usage is unavailable.'}
        </div>
      )}

      {summary?.accounts.length ? (
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 650, marginBottom: 2 }}>Accounts</div>
          {summary.accounts.map((account) => <AccountRow key={account.id} account={account} />)}
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Account breakdown not returned by Hermes Agent.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <PopoverLink onClick={() => onNavigate('/settings?section=usage')}>Usage</PopoverLink>
        <PopoverLink onClick={() => onNavigate('/settings?section=hermes-agent')}>Hermes Agent</PopoverLink>
      </div>
    </div>
  )
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 9px', background: 'var(--bg-card)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function PopoverLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        height: 28,
        padding: '0 10px',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
    </button>
  )
}

export default function HermesUsagePill() {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { usage, loading, fetching, error, fromCache, lastUpdatedAt, refetch } = useHermesUsage()
  const windows = useMemo(() => usage?.windows ?? [], [usage])
  const showWindowMeters = windows.length > 0
  const label = showWindowMeters ? 'Hermes' : hermesUsageCompactLabel(usage)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const navigateAndClose = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Hermes Agent usage"
        title={usageDetailLine(usage)}
        onClick={() => setOpen((value) => !value)}
        style={{
          minHeight: 30,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 9px',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 11,
        }}
      >
        <ChartLineUp size={14} style={{ color: error && !fromCache ? 'var(--amber)' : 'var(--accent)' }} />
        <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{label}</span>
        {showWindowMeters && (
          <span className="hermes-usage-window-meters" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {windows.map((window) => <WindowMeter key={window.id} window={window} />)}
          </span>
        )}
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: error && !fromCache ? 'var(--amber)' : fetching ? 'var(--accent)' : 'var(--secondary)',
          opacity: loading ? 0.55 : 1,
        }} />
      </button>
      {open && (
        <UsagePopover
          summary={usage}
          loading={loading}
          fetching={fetching}
          error={error}
          fromCache={fromCache}
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={refetch}
          onNavigate={navigateAndClose}
        />
      )}
    </div>
  )
}
