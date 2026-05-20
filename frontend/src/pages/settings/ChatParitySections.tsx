import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { useCodexLbUsage } from '@/hooks/useCodexLbUsage'
import { formatCodexUsageCost, formatCodexUsageNumber, formatCodexUsagePercent } from '@/lib/codex-lb-usage'
import { row, rowLast, val, sectionLabel } from './shared'
import ProviderSettingsPanel from '@/vendor/t3/providers/ProviderSettingsPanel'
import { normalizeChatProviderSnapshots } from '@/chat/t3-adapters/providerSnapshots'
import type { ModelOption } from '@/pages/chat/types'

type ProviderStatus = {
  id: string
  name: string
  ready: boolean
  selectable?: boolean
  detail: string
}

type ProviderStatusResponse = {
  providers: ProviderStatus[]
}

type ModelsResponse = {
  models: ModelOption[]
}

type RuntimeConfigResponse = {
  currentModel?: string
  model?: string
  favoriteModels?: string[]
  chatModel?: string
}

export const UsageSection = memo(function UsageSection() {
  const { usage, loading, error } = useCodexLbUsage()
  const period = usage?.period
  const accounts = Array.isArray(usage?.accounts) ? usage.accounts : []

  return (
    <div>
      <div style={sectionLabel}>Codex LB Usage</div>
      <div style={row}>
        <span>Status</span>
        <span style={val}>{loading ? 'Loading...' : error ? 'Unavailable' : usage ? 'Available' : 'No usage data'}</span>
      </div>
      <div style={row}><span>Used</span><span style={val}>{formatCodexUsageNumber(usage?.used ?? usage?.totalTokens)}</span></div>
      <div style={row}><span>Remaining</span><span style={val}>{formatCodexUsageNumber(usage?.remaining)}</span></div>
      <div style={row}><span>Total cost</span><span style={val}>{formatCodexUsageCost(usage?.totalCost)}</span></div>
      {accounts.slice(0, 3).map((account) => (
        <div key={account.id} style={row}>
          <span>{account.label}</span>
          <span style={val}>{account.remaining !== undefined ? `${formatCodexUsageNumber(account.remaining)} left` : formatCodexUsagePercent(account.percent)}</span>
        </div>
      ))}
      <div style={rowLast}><span>Period</span><span style={val}>{period ?? '—'}</span></div>
    </div>
  )
})

export const ProvidersSection = memo(function ProvidersSection() {
  const { data, isLoading, error } = useQuery<ProviderStatusResponse>({
    queryKey: ['chat', 'providers', 'status'],
    queryFn: () => api.get<ProviderStatusResponse>('/api/chat/providers/status'),
    staleTime: 15_000,
  })
  const { data: modelsData, isLoading: modelsLoading, error: modelsError } = useQuery<ModelsResponse>({
    queryKey: ['chat', 'models', 'provider-settings'],
    queryFn: () => api.get<ModelsResponse>('/api/chat/models'),
    staleTime: 15_000,
  })
  const providers = data?.providers ?? []
  const providerSnapshots = normalizeChatProviderSnapshots({
    providers,
    models: modelsData?.models ?? [],
  })

  return (
    <ProviderSettingsPanel
      providers={providerSnapshots}
      loading={isLoading || modelsLoading}
      error={Boolean(error || modelsError)}
    />
  )
})

export const CodexLbSection = memo(function CodexLbSection() {
  const { usage } = useCodexLbUsage()
  const accounts = Array.isArray(usage?.accounts) ? usage.accounts : []
  const windows = Array.isArray(usage?.windows) ? usage.windows : []
  const { data, isLoading, error } = useQuery<RuntimeConfigResponse>({
    queryKey: ['harness', 'runtime-config'],
    queryFn: () => api.get<RuntimeConfigResponse>('/api/harness/runtime-config'),
    staleTime: 15_000,
  })
  const selectedModel = data?.currentModel ?? data?.chatModel ?? data?.model

  return (
    <div>
      <div style={sectionLabel}>Codex LB</div>
      <div style={row}><span>Chat provider</span><span style={val}>Hermes</span></div>
      <div style={row}><span>Usage accounts</span><span style={val}>{accounts.length}</span></div>
      <div style={row}><span>5h limit</span><span style={val}>{formatCodexUsagePercent(windows.find((window) => window.id === 'fiveHour')?.percent)}</span></div>
      <div style={row}><span>Weekly limit</span><span style={val}>{formatCodexUsagePercent(windows.find((window) => window.id === 'weekly')?.percent)}</span></div>
      <div style={row}>
        <span>Runtime config</span>
        <span style={val}>{isLoading ? 'Loading...' : error ? 'Unavailable' : 'Available'}</span>
      </div>
      <div style={row}><span>Current model</span><span style={val}>{selectedModel ?? '—'}</span></div>
      <div style={rowLast}><span>Favorite models</span><span style={val}>{data?.favoriteModels?.length ?? 0}</span></div>
    </div>
  )
})
