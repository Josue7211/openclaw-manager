/*
 * Copied/adapted from T3 Code apps/web/src/routes/settings.providers.tsx and
 * apps/web/src/components/settings/ProviderInstanceCard.tsx (MIT License).
 * The panel consumes T3-shaped ServerProvider snapshots and delegates per-card
 * presentation to the copied/adapted ProviderInstanceCard layer.
 */

import {
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from './providerInstances'
import type { ServerProvider } from './providerTypes'
import ProviderInstanceCard from './ProviderInstanceCard'
import type { CSSProperties } from 'react'

interface ProviderSettingsPanelProps {
  providers: ReadonlyArray<ServerProvider>
  loading?: boolean
  error?: boolean
}

export default function ProviderSettingsPanel({
  providers,
  loading = false,
  error = false,
}: ProviderSettingsPanelProps) {
  const entries = sortProviderInstanceEntries(deriveProviderInstanceEntries(providers))

  return (
    <section aria-label="Chat provider readiness" style={{ display: 'grid', gap: 10 }}>
      <div style={panelHeaderStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Chat Providers</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {loading ? 'Checking...' : error ? 'Unavailable' : `${entries.length} configured`}
        </div>
      </div>

      {loading && (
        <div style={emptyStateStyle}>Checking provider readiness...</div>
      )}
      {error && (
        <div style={emptyStateStyle}>Provider status unavailable</div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div style={emptyStateStyle}>No providers reported</div>
      )}

      {!loading && !error && entries.map(entry => (
        <ProviderInstanceCard key={entry.instanceId} entry={entry} />
      ))}
    </section>
  )
}

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const emptyStateStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  padding: 12,
  fontSize: 13,
}
