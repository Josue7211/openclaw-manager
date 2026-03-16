import { RefreshCw } from 'lucide-react'
import SecondsAgo from '@/components/SecondsAgo'
import { PageHeader } from '@/components/PageHeader'
import { DemoBadge } from '@/components/DemoModeBanner'

interface DashboardHeaderProps {
  isDemo: boolean
  subagentsError: boolean
  lastRefreshMs: number
  onRefresh: () => void
}

export function DashboardHeader({ isDemo, subagentsError, lastRefreshMs, onRefresh }: DashboardHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px',
      animation: 'fadeInUp 0.5s var(--ease-spring) both', flexShrink: 0,
    }}>
      <div>
        <PageHeader defaultTitle="Dashboard" defaultSubtitle="system overview \u00b7 realtime" />
        {isDemo && <DemoBadge />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {subagentsError && (
          <span style={{
            fontSize: '11px', color: 'var(--amber)',
            fontFamily: "'JetBrains Mono', monospace",
            padding: '4px 10px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '8px',
          }}>
            stale
          </span>
        )}
        <span aria-live="polite" style={{
          fontSize: '11px', color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono', monospace",
          padding: '4px 10px',
          background: 'var(--bg-white-03)',
          borderRadius: '8px',
        }}>
          <SecondsAgo sinceMs={lastRefreshMs} />
        </span>
        <button
          onClick={onRefresh}
          style={{
            background: 'var(--hover-bg)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            color: 'var(--text-secondary)',
            padding: '7px 14px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 500,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
    </div>
  )
}
