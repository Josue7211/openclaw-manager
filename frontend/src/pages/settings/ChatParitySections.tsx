import { memo, useMemo, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { useHermesUsage } from '@/hooks/useHermesUsage'
import {
  formatHermesUsageCost,
  formatHermesUsageNumber,
  formatHermesUsagePercent,
  formatHermesUsageReset,
  type HermesUsageAccount,
  type HermesUsageWindow,
} from '@/lib/hermes-usage'
import { row, rowLast, val, sectionLabel } from '@/features/settings/shared'
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
  chatPrimaryModel?: string
  heartbeatModel?: string
}

type HermesDashboardTrendPoint = { t?: string; v?: number }
type HermesDashboardAccount = {
  accountId?: string
  id?: string
  email?: string
  displayName?: string
  planType?: string
  status?: string
  usage?: {
    primaryRemainingPercent?: number | null
    secondaryRemainingPercent?: number | null
  } | null
  resetAtPrimary?: string | null
  resetAtSecondary?: string | null
  requestUsage?: {
    requestCount?: number
    totalTokens?: number
    cachedInputTokens?: number
    totalCostUsd?: number
  } | null
  auth?: {
    access?: { expiresAt?: string | null; state?: string | null } | null
    refresh?: { expiresAt?: string | null; state?: string | null } | null
  } | null
}
type HermesDashboardOverview = {
  lastSyncAt?: string | null
  accounts?: HermesDashboardAccount[]
  summary?: {
    primaryWindow?: { remainingPercent?: number; capacityCredits?: number; remainingCredits?: number; resetAt?: string | null }
    secondaryWindow?: { remainingPercent?: number; capacityCredits?: number; remainingCredits?: number; resetAt?: string | null } | null
    cost?: { totalUsd?: number; currency?: string }
    metrics?: {
      requests?: number | null
      tokens?: number | null
      cachedInputTokens?: number | null
      errorRate?: number | null
      errorCount?: number | null
      topError?: string | null
    } | null
  }
  trends?: {
    requests?: HermesDashboardTrendPoint[]
    tokens?: HermesDashboardTrendPoint[]
    cost?: HermesDashboardTrendPoint[]
    errorRate?: HermesDashboardTrendPoint[]
  }
}
type HermesDashboardRequestLog = {
  requestedAt?: string
  accountId?: string | null
  apiKeyName?: string | null
  model?: string
  transport?: string | null
  status?: string
  tokens?: number | null
  cachedInputTokens?: number | null
  costUsd?: number | null
  latencyMs?: number | null
  requestId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
}
type HermesDashboardRequestLogsResponse = {
  requests?: HermesDashboardRequestLog[]
  total?: number
  hasMore?: boolean
}
type HermesDashboardAccountsResponse = {
  accounts?: HermesDashboardAccount[]
}
type HermesDashboardApiKey = {
  id?: string
  name?: string
  keyPrefix?: string
  isActive?: boolean
  expiresAt?: string | null
  lastUsedAt?: string | null
  allowedModels?: string[] | null
  assignedAccountIds?: string[]
  limits?: Array<{ limitType?: string; limitWindow?: string; maxValue?: number; currentValue?: number; resetAt?: string }>
  usageSummary?: {
    requestCount?: number
    totalTokens?: number
    cachedInputTokens?: number
    totalCostUsd?: number
  } | null
}
type HermesDashboardSettings = {
  routingStrategy?: string
  stickyThreadsEnabled?: boolean
  version?: string
  appVersion?: string
  [key: string]: unknown
}
type HermesDashboardAuthSession = {
  authenticated?: boolean
  passwordRequired?: boolean
  totpRequiredOnLogin?: boolean
  totpConfigured?: boolean
  bootstrapRequired?: boolean
  authMode?: string
}

const HERMES_DASHBOARD_CARD: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-elevated)',
  padding: 16,
}

const HERMES_DASHBOARD_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
}

const HERMES_DASHBOARD_TABLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

function displayPercent(remaining: number | null | undefined): number | undefined {
  return typeof remaining === 'number' && Number.isFinite(remaining) ? Math.max(0, Math.min(100, remaining)) : undefined
}

function remainingPercentFromUsageWindow(window: HermesUsageWindow | undefined): number | undefined {
  if (!window) return undefined
  if (typeof window.remaining === 'number' && typeof window.limit === 'number' && window.limit > 0) {
    return displayPercent((window.remaining / window.limit) * 100)
  }
  if (typeof window.percent === 'number' && Number.isFinite(window.percent)) {
    return displayPercent(100 - window.percent)
  }
  return undefined
}

function usageWindow(account: HermesUsageAccount | undefined, id: 'fiveHour' | 'weekly'): HermesUsageWindow | undefined {
  return account?.windows?.find((window) => window.id === id)
}

function accountFromUsage(account: HermesUsageAccount): HermesDashboardAccount {
  const fiveHour = usageWindow(account, 'fiveHour')
  const weekly = usageWindow(account, 'weekly')
  return {
    accountId: account.id,
    displayName: account.label,
    status: account.status,
    usage: {
      primaryRemainingPercent: remainingPercentFromUsageWindow(fiveHour),
      secondaryRemainingPercent: remainingPercentFromUsageWindow(weekly),
    },
    resetAtPrimary: fiveHour?.resetAt ?? account.resetAt,
    resetAtSecondary: weekly?.resetAt ?? account.resetAt,
  }
}

function accountKeys(account: Pick<HermesDashboardAccount, 'accountId' | 'id' | 'email' | 'displayName'>): string[] {
  return [account.accountId, account.id, account.email, account.displayName]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase())
}

function mergeAccountUsage(base: HermesDashboardAccount, usageAccount: HermesUsageAccount | undefined): HermesDashboardAccount {
  if (!usageAccount) return base
  const usage = accountFromUsage(usageAccount)
  const nextPrimary = displayPercent(usage.usage?.primaryRemainingPercent)
  const nextSecondary = displayPercent(usage.usage?.secondaryRemainingPercent)
  const hasLiveQuota =
    (nextPrimary !== undefined && nextPrimary > 0) ||
    (nextSecondary !== undefined && nextSecondary > 0) ||
    usageAccount.remaining !== undefined

  return {
    ...base,
    status: hasLiveQuota && base.status === 'quota_exceeded' ? 'active' : (usage.status ?? base.status),
    usage: {
      ...base.usage,
      primaryRemainingPercent: nextPrimary ?? base.usage?.primaryRemainingPercent,
      secondaryRemainingPercent: nextSecondary ?? base.usage?.secondaryRemainingPercent,
    },
    resetAtPrimary: usage.resetAtPrimary ?? base.resetAtPrimary,
    resetAtSecondary: usage.resetAtSecondary ?? base.resetAtSecondary,
  }
}

function mergeHermesDashboardAccounts(
  accounts: HermesDashboardAccount[],
  usageAccounts: HermesUsageAccount[],
): HermesDashboardAccount[] {
  if (usageAccounts.length === 0) return accounts
  const usageByKey = new Map<string, HermesUsageAccount>()
  for (const usageAccount of usageAccounts) {
    for (const key of accountKeys({ accountId: usageAccount.id, displayName: usageAccount.label })) {
      usageByKey.set(key, usageAccount)
    }
  }

  const seen = new Set<string>()
  const merged = accounts.map((account) => {
    const match = accountKeys(account).map((key) => usageByKey.get(key)).find(Boolean)
    if (match) {
      for (const key of accountKeys(account)) seen.add(key)
      for (const key of accountKeys({ accountId: match.id, displayName: match.label })) seen.add(key)
    }
    return mergeAccountUsage(account, match)
  })

  for (const usageAccount of usageAccounts) {
    const keys = accountKeys({ accountId: usageAccount.id, displayName: usageAccount.label })
    if (!keys.some((key) => seen.has(key))) merged.push(accountFromUsage(usageAccount))
  }

  return merged
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return value
  return new Date(time).toLocaleString([], { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' })
}

function splitLogDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '--', time: '--' }
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return { date: value, time: '--' }
  const date = new Date(time)
  return {
    date: date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }),
    time: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }
}

function formatStatus(value: string | boolean | null | undefined): string {
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'
  if (!value) return '--'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function accountLabel(account: HermesDashboardAccount): string {
  return account.displayName || account.email || account.accountId || account.id || 'Unknown account'
}

function accountId(account: HermesDashboardAccount): string {
  return account.accountId || account.id || account.email || accountLabel(account)
}

function shortModel(model: string | undefined): string {
  return model?.replace(/^openai-codex\//, '').replace(/^openai\//, '') ?? '--'
}

function valueAsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[$,\s]/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function normalizeRequestLog(raw: HermesDashboardRequestLog): HermesDashboardRequestLog {
  const record = valueAsRecord(raw)
  return {
    ...raw,
    requestedAt: raw.requestedAt ?? firstString(record, ['createdAt', 'created_at', 'timestamp', 'time', 'startedAt', 'started_at']),
    accountId: raw.accountId ?? firstString(record, ['account_id', 'account', 'accountEmail', 'email', 'user']),
    apiKeyName: raw.apiKeyName ?? firstString(record, ['api_key_name', 'apiKey', 'api_key', 'keyName', 'key_name']),
    model: raw.model ?? firstString(record, ['modelName', 'model_name', 'modelId', 'model_id']),
    transport: raw.transport ?? firstString(record, ['source', 'provider', 'route']),
    status: raw.status ?? firstString(record, ['state', 'result']),
    tokens: raw.tokens ?? firstNumber(record, ['totalTokens', 'total_tokens', 'tokenCount', 'token_count']),
    cachedInputTokens: raw.cachedInputTokens ?? firstNumber(record, ['cachedTokens', 'cached_tokens', 'cached_input_tokens']),
    costUsd: raw.costUsd ?? firstNumber(record, ['cost', 'cost_usd', 'totalCostUsd', 'total_cost_usd']),
    latencyMs: raw.latencyMs ?? firstNumber(record, ['latency', 'latency_ms', 'durationMs', 'duration_ms']),
    requestId: raw.requestId ?? firstString(record, ['request_id', 'id']),
    errorCode: raw.errorCode ?? firstString(record, ['error_code']),
    errorMessage: raw.errorMessage ?? firstString(record, ['error', 'error_message', 'message']),
  }
}

function sparkline(points: HermesDashboardTrendPoint[] | undefined, color: string) {
  const values = asArray(points).map((point) => Number(point.v ?? 0)).filter(Number.isFinite)
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const width = 120
  const height = 28
  const d = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const y = height - (value / max) * (height - 2) - 1
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function MiniStat({ label, value, meta, color, trend }: { label: string; value: string; meta?: string; color: string; trend?: HermesDashboardTrendPoint[] }) {
  return (
    <div style={HERMES_DASHBOARD_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
      </div>
      <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ marginTop: 8, minHeight: 16, fontSize: 12, color: 'var(--text-muted)' }}>{meta ?? ''}</div>
      <div style={{ marginTop: 8, height: 28 }}>{sparkline(trend, color)}</div>
    </div>
  )
}

function ProgressLine({ label, percent, resetAt }: { label: string; percent: number | undefined; resetAt?: string | null }) {
  const used = percent ?? 0
  const tone = used >= 95 ? 'var(--danger)' : used >= 80 ? 'var(--warning)' : 'var(--secondary)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>{label}</span>
        <span style={{ color: tone, fontVariantNumeric: 'tabular-nums' }}>{formatHermesUsagePercent(percent)}</span>
      </div>
      <div style={{ marginTop: 6, height: 6, borderRadius: 99, background: 'var(--hover-bg)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, used))}%`, height: '100%', borderRadius: 99, background: tone }} />
      </div>
      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>Reset {formatHermesUsageReset(resetAt ?? undefined)}</div>
    </div>
  )
}

function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...HERMES_DASHBOARD_CARD, padding: 0, overflow: 'auto' }}>
      <table style={HERMES_DASHBOARD_TABLE}>{children}</table>
    </div>
  )
}

function HeadCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '10px 12px', textAlign: align, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>{children}</th>
}

function Cell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ padding: '10px 12px', textAlign: align, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</td>
}

const hermesDashboardInputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  padding: '9px 11px',
  fontSize: 13,
  outline: 'none',
}

function HermesDashboardAuthPanel({
  session,
  password,
  setPassword,
  totp,
  setTotp,
  onLogin,
  onVerifyTotp,
  pending,
  error,
}: {
  session: HermesDashboardAuthSession | undefined
  password: string
  setPassword: (value: string) => void
  totp: string
  setTotp: (value: string) => void
  onLogin: () => void
  onVerifyTotp: () => void
  pending: boolean
  error: string | null
}) {
  const needsTotp = Boolean(session?.totpRequiredOnLogin)
  return (
    <div style={{
      ...HERMES_DASHBOARD_CARD,
      display: 'grid',
      gridTemplateColumns: 'minmax(240px, 1fr) minmax(260px, 420px)',
      gap: 18,
      borderColor: 'var(--accent)',
      background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-white-03))',
    }}>
      <div>
        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 18 }}>Connect Hermes Agent dashboard</div>
        <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>
          Hermes Agent dashboard data needs an authenticated dashboard session. Connect it here so overview,
          accounts, API keys, and request logs can load inside the app.
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 12 }}>
          <span>Auth: {session?.authMode ?? 'standard'}</span>
          <span>Password: {session?.passwordRequired ? 'required' : 'not required'}</span>
          <span>TOTP: {session?.totpConfigured ? 'configured' : 'off'}</span>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (needsTotp) onVerifyTotp()
          else onLogin()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {needsTotp ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
            TOTP code
            <input
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              style={hermesDashboardInputStyle}
            />
          </label>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
            Dashboard password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Hermes Agent dashboard password"
              style={hermesDashboardInputStyle}
            />
          </label>
        )}
        {error ? <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div> : null}
        <button
          type="submit"
          disabled={pending || (needsTotp ? totp.trim().length < 6 : password.trim().length === 0)}
          style={{
            border: 'none',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--text-on-accent)',
            padding: '9px 12px',
            fontWeight: 700,
            cursor: pending ? 'wait' : 'pointer',
            opacity: pending ? 0.75 : 1,
          }}
        >
          {pending ? 'Connecting...' : needsTotp ? 'Verify TOTP' : 'Connect dashboard'}
        </button>
      </form>
    </div>
  )
}

export const UsageSection = memo(function UsageSection() {
  const { usage, loading, error } = useHermesUsage()
  const period = usage?.period
  const accounts = Array.isArray(usage?.accounts) ? usage.accounts : []

  return (
    <div>
      <div style={sectionLabel}>Hermes Agent Usage</div>
      <div style={row}>
        <span>Status</span>
        <span style={val}>{loading ? 'Loading...' : error ? 'Unavailable' : usage ? 'Available' : 'No usage data'}</span>
      </div>
      <div style={row}><span>Used</span><span style={val}>{formatHermesUsageNumber(usage?.used ?? usage?.totalTokens)}</span></div>
      <div style={row}><span>Remaining</span><span style={val}>{formatHermesUsageNumber(usage?.remaining)}</span></div>
      <div style={row}><span>Total cost</span><span style={val}>{formatHermesUsageCost(usage?.totalCost)}</span></div>
      {accounts.slice(0, 3).map((account) => (
        <div key={account.id} style={row}>
          <span>{account.label}</span>
          <span style={val}>{account.remaining !== undefined ? `${formatHermesUsageNumber(account.remaining)} left` : formatHermesUsagePercent(account.percent)}</span>
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

export const HermesAgentSection = memo(function HermesAgentSection() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'dashboard' | 'accounts' | 'apis' | 'logs'>('dashboard')
  const [dashboardPassword, setDashboardPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const { usage } = useHermesUsage()
  const usageAccounts = Array.isArray(usage?.accounts) ? usage.accounts : []
  const usageWindows = Array.isArray(usage?.windows) ? usage.windows : []
  const runtimeQuery = useQuery<RuntimeConfigResponse>({
    queryKey: ['hermes', 'runtime-config'],
    queryFn: () => api.get<RuntimeConfigResponse>('/api/hermes/runtime-config'),
    staleTime: 15_000,
  })
  const overviewQuery = useQuery<HermesDashboardOverview>({
    queryKey: ['hermes-dashboard', 'overview', '7d'],
    queryFn: () => api.get<HermesDashboardOverview>('/api/hermes/dashboard/overview?timeframe=7d'),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const accountsQuery = useQuery<HermesDashboardAccountsResponse>({
    queryKey: ['hermes-dashboard', 'accounts'],
    queryFn: () => api.get<HermesDashboardAccountsResponse>('/api/hermes/dashboard/accounts'),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const apiKeysQuery = useQuery<HermesDashboardApiKey[]>({
    queryKey: ['hermes-dashboard', 'api-keys'],
    queryFn: () => api.get<HermesDashboardApiKey[]>('/api/hermes/dashboard/api-keys'),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const logsQuery = useQuery<HermesDashboardRequestLogsResponse>({
    queryKey: ['hermes-dashboard', 'request-logs', 25],
    queryFn: () => api.get<HermesDashboardRequestLogsResponse>('/api/hermes/dashboard/request-logs?limit=25'),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const settingsQuery = useQuery<HermesDashboardSettings>({
    queryKey: ['hermes-dashboard', 'settings'],
    queryFn: () => api.get<HermesDashboardSettings>('/api/hermes/dashboard/settings'),
    refetchInterval: 60_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const authSessionQuery = useQuery<HermesDashboardAuthSession>({
    queryKey: ['hermes-dashboard', 'auth', 'session'],
    queryFn: () => api.get<HermesDashboardAuthSession>('/api/hermes/dashboard/auth/session'),
    refetchInterval: 60_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const refreshHermesDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: ['hermes-dashboard'] })
  }
  const loginMutation = useMutation({
    mutationFn: () => api.post<HermesDashboardAuthSession>('/api/hermes/dashboard/auth/login', { password: dashboardPassword }),
    onSuccess: (session) => {
      setAuthError(null)
      if (!session.totpRequiredOnLogin) setDashboardPassword('')
      refreshHermesDashboard()
    },
    onError: (error) => setAuthError(error instanceof Error ? error.message : 'Hermes Agent login failed'),
  })
  const totpMutation = useMutation({
    mutationFn: () => api.post<HermesDashboardAuthSession>('/api/hermes/dashboard/auth/totp', { code: totpCode }),
    onSuccess: () => {
      setAuthError(null)
      setDashboardPassword('')
      setTotpCode('')
      refreshHermesDashboard()
    },
    onError: (error) => setAuthError(error instanceof Error ? error.message : 'Hermes Agent TOTP verification failed'),
  })

  const overview = overviewQuery.data
  const accounts = useMemo(() => {
    const direct = asArray(accountsQuery.data?.accounts)
    const upstreamAccounts = direct.length > 0 ? direct : asArray(overview?.accounts)
    return mergeHermesDashboardAccounts(upstreamAccounts, usageAccounts)
  }, [accountsQuery.data?.accounts, overview?.accounts, usageAccounts])
  const logs = asArray(logsQuery.data?.requests).map(normalizeRequestLog)
  const apiKeys = asArray(apiKeysQuery.data)
  const runtime = runtimeQuery.data
  const selectedModel = runtime?.currentModel ?? runtime?.chatPrimaryModel ?? runtime?.chatModel ?? runtime?.model
  const primaryWindow = overview?.summary?.primaryWindow
  const secondaryWindow = overview?.summary?.secondaryWindow
  const metrics = overview?.summary?.metrics
  const fiveHourUsageWindow = usageWindows.find((window) => window.id === 'fiveHour')
  const weeklyUsageWindow = usageWindows.find((window) => window.id === 'weekly')
  const primaryPercent = displayPercent(primaryWindow?.remainingPercent) ?? remainingPercentFromUsageWindow(fiveHourUsageWindow)
  const secondaryPercent = displayPercent(secondaryWindow?.remainingPercent) ?? remainingPercentFromUsageWindow(weeklyUsageWindow)
  const totalCost = overview?.summary?.cost?.totalUsd ?? usage?.totalCost
  const requestTotal = metrics?.requests ?? logsQuery.data?.total
  const tokenTotal = metrics?.tokens ?? usage?.totalTokens ?? usage?.used
  const cachedTokens = metrics?.cachedInputTokens
  const errorRate = metrics?.errorRate
  const errorCount = metrics?.errorCount
  const upstreamUnavailable = Boolean(overviewQuery.error && accountsQuery.error && logsQuery.error && apiKeysQuery.error)
  const authSession = authSessionQuery.data
  const needsDashboardAuth = authSession?.authenticated === false && authSession.passwordRequired !== false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={sectionLabel}>Hermes Agent</div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22 }}>Hermes Agent Dashboard</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Real Hermes Agent overview, accounts, API keys, and request logs from the configured Hermes Agent.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['dashboard', 'accounts', 'apis', 'logs'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '7px 11px',
                background: view === item ? 'var(--accent)' : 'var(--bg-elevated)',
                color: view === item ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {item === 'apis' ? 'APIs' : item}
            </button>
          ))}
        </div>
      </div>

      {needsDashboardAuth ? (
        <HermesDashboardAuthPanel
          session={authSession}
          password={dashboardPassword}
          setPassword={setDashboardPassword}
          totp={totpCode}
          setTotp={setTotpCode}
          onLogin={() => loginMutation.mutate()}
          onVerifyTotp={() => totpMutation.mutate()}
          pending={loginMutation.isPending || totpMutation.isPending}
          error={authError}
        />
      ) : upstreamUnavailable ? (
        <div style={{ ...HERMES_DASHBOARD_CARD, borderColor: 'var(--warning)' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Hermes Agent dashboard APIs unavailable</div>
          <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>
            Showing fallback `/usage` data where possible. Connect the dashboard session or point HERMES_API_URL at Hermes Agent to load full data.
          </div>
        </div>
      ) : null}

      <div style={HERMES_DASHBOARD_GRID}>
        <MiniStat
          label="Requests (7d)"
          value={formatHermesUsageNumber(requestTotal)}
          meta={requestTotal !== undefined ? `Avg/day ${formatHermesUsageNumber(Math.round((requestTotal ?? 0) / 7))}` : 'From request logs'}
          color="#3b82f6"
          trend={overview?.trends?.requests}
        />
        <MiniStat
          label="Tokens (7d)"
          value={formatHermesUsageNumber(tokenTotal)}
          meta={cachedTokens != null ? `Cached: ${formatHermesUsageNumber(cachedTokens)}` : undefined}
          color="#8b5cf6"
          trend={overview?.trends?.tokens}
        />
        <MiniStat
          label="Cost (7d)"
          value={formatHermesUsageCost(totalCost)}
          meta={totalCost !== undefined ? `Avg/day ${formatHermesUsageCost(totalCost / 7)}` : undefined}
          color="#10b981"
          trend={overview?.trends?.cost}
        />
        <MiniStat
          label="Error Rate (7d)"
          value={errorRate !== undefined && errorRate !== null ? `${errorRate.toFixed(1)}%` : '--'}
          meta={errorCount !== undefined && errorCount !== null ? `${errorCount} errors` : metrics?.topError ?? undefined}
          color="#f59e0b"
          trend={overview?.trends?.errorRate}
        />
      </div>

      <div style={HERMES_DASHBOARD_GRID}>
        <div style={HERMES_DASHBOARD_CARD}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>5h limit</div>
          <ProgressLine label="Remaining" percent={primaryPercent} resetAt={primaryWindow?.resetAt ?? fiveHourUsageWindow?.resetAt} />
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>
            Remaining {formatHermesUsageNumber(primaryWindow?.remainingCredits ?? fiveHourUsageWindow?.remaining)}
          </div>
        </div>
        <div style={HERMES_DASHBOARD_CARD}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>Weekly limit</div>
          <ProgressLine label="Remaining" percent={secondaryPercent} resetAt={secondaryWindow?.resetAt ?? weeklyUsageWindow?.resetAt} />
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>
            Remaining {formatHermesUsageNumber(secondaryWindow?.remainingCredits ?? weeklyUsageWindow?.remaining)}
          </div>
        </div>
        <div style={HERMES_DASHBOARD_CARD}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>Runtime</div>
          <div style={row}><span>Chat provider</span><span style={val}>Hermes Agent</span></div>
          <div style={row}><span>Runtime config</span><span style={val}>{runtimeQuery.isLoading ? 'Loading...' : runtimeQuery.error ? 'Unavailable' : 'Available'}</span></div>
          <div style={row}><span>Current model</span><span style={val}>{selectedModel ?? '--'}</span></div>
          <div style={rowLast}><span>Favorite models</span><span style={val}>{runtime?.favoriteModels?.length ?? 0}</span></div>
        </div>
        <div style={HERMES_DASHBOARD_CARD}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>Sync</div>
          <div style={row}><span>Usage accounts</span><span style={val}>{accounts.length || usageAccounts.length}</span></div>
          <div style={row}><span>API keys</span><span style={val}>{apiKeys.length}</span></div>
          <div style={row}><span>Routing</span><span style={val}>{settingsQuery.data?.routingStrategy ?? '--'}</span></div>
          <div style={rowLast}><span>Last sync</span><span style={val}>{formatDateTime(overview?.lastSyncAt)}</span></div>
        </div>
      </div>

      {view === 'dashboard' ? <HermesDashboardDashboardPanel accounts={accounts} logs={logs} /> : null}
      {view === 'accounts' ? <HermesDashboardAccountsPanel accounts={accounts} /> : null}
      {view === 'apis' ? <HermesDashboardApisPanel apiKeys={apiKeys} /> : null}
      {view === 'logs' ? <HermesDashboardLogsPanel logs={logs} accounts={accounts} total={logsQuery.data?.total} /> : null}
    </div>
  )
})

function HermesDashboardDashboardPanel({ accounts, logs }: { accounts: HermesDashboardAccount[]; logs: HermesDashboardRequestLog[] }) {
  const labels = useMemo(() => new Map(accounts.map((account) => [accountId(account), accountLabel(account)])), [accounts])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      <div style={HERMES_DASHBOARD_CARD}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>Accounts</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {accounts.slice(0, 6).map((account) => (
            <div key={accountId(account)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text-primary)', fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountLabel(account)}</span>
                <span style={{ color: account.status === 'active' ? 'var(--secondary)' : 'var(--text-muted)' }}>{formatStatus(account.status)}</span>
              </div>
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ProgressLine label="5h" percent={displayPercent(account.usage?.primaryRemainingPercent)} resetAt={account.resetAtPrimary} />
                <ProgressLine label="Weekly" percent={displayPercent(account.usage?.secondaryRemainingPercent)} resetAt={account.resetAtSecondary} />
              </div>
            </div>
          ))}
          {accounts.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No accounts returned.</div> : null}
        </div>
      </div>
      <div style={HERMES_DASHBOARD_CARD}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 12 }}>Recent Requests</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.slice(0, 8).map((log, index) => {
            const when = splitLogDateTime(log.requestedAt)
            return (
              <div
                key={`${log.requestId ?? log.requestedAt ?? ''}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '76px minmax(120px, 1.2fr) minmax(92px, 0.8fr) minmax(82px, 0.7fr) auto',
                  gap: 10,
                  alignItems: 'center',
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 12 }}>{when.time}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{when.date}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.accountId ? (labels.get(log.accountId) ?? log.accountId) : '--'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.apiKeyName ?? '--'}
                  </div>
                </div>
                <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shortModel(log.model)}
                </div>
                <div style={{ minWidth: 0, textAlign: 'right' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 12 }}>{formatHermesUsageNumber(log.tokens ?? undefined)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatHermesUsageCost(log.costUsd ?? undefined)}</div>
                </div>
                <div style={{ color: log.status === 'ok' ? 'var(--secondary)' : 'var(--danger)', fontSize: 12, textAlign: 'right' }}>
                  {formatStatus(log.status)}
                </div>
            </div>
            )
          })}
          {logs.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No request logs returned.</div> : null}
        </div>
      </div>
    </div>
  )
}

function HermesDashboardAccountsPanel({ accounts }: { accounts: HermesDashboardAccount[] }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <HeadCell>Account</HeadCell>
          <HeadCell>Plan</HeadCell>
          <HeadCell>Status</HeadCell>
          <HeadCell align="right">5h</HeadCell>
          <HeadCell align="right">Weekly</HeadCell>
          <HeadCell align="right">Tokens</HeadCell>
          <HeadCell align="right">Cost</HeadCell>
          <HeadCell>Token status</HeadCell>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={accountId(account)}>
            <Cell>{accountLabel(account)}</Cell>
            <Cell>{formatStatus(account.planType)}</Cell>
            <Cell>{formatStatus(account.status)}</Cell>
            <Cell align="right">{formatHermesUsagePercent(displayPercent(account.usage?.primaryRemainingPercent))}</Cell>
            <Cell align="right">{formatHermesUsagePercent(displayPercent(account.usage?.secondaryRemainingPercent))}</Cell>
            <Cell align="right">{formatHermesUsageNumber(account.requestUsage?.totalTokens)}</Cell>
            <Cell align="right">{formatHermesUsageCost(account.requestUsage?.totalCostUsd)}</Cell>
            <Cell>{formatStatus(account.auth?.access?.state ?? (account.auth?.access?.expiresAt ? 'valid' : undefined))}</Cell>
          </tr>
        ))}
        {accounts.length === 0 ? <tr><Cell>No accounts returned.</Cell></tr> : null}
      </tbody>
    </DataTable>
  )
}

function HermesDashboardApisPanel({ apiKeys }: { apiKeys: HermesDashboardApiKey[] }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <HeadCell>Name</HeadCell>
          <HeadCell>Prefix</HeadCell>
          <HeadCell>Status</HeadCell>
          <HeadCell align="right">Requests</HeadCell>
          <HeadCell align="right">Tokens</HeadCell>
          <HeadCell align="right">Cost</HeadCell>
          <HeadCell align="right">Limits</HeadCell>
          <HeadCell>Expiry</HeadCell>
        </tr>
      </thead>
      <tbody>
        {apiKeys.map((key) => (
          <tr key={key.id ?? key.keyPrefix ?? key.name}>
            <Cell>{key.name ?? '--'}</Cell>
            <Cell>{key.keyPrefix ?? '--'}</Cell>
            <Cell>{formatStatus(key.isActive)}</Cell>
            <Cell align="right">{formatHermesUsageNumber(key.usageSummary?.requestCount)}</Cell>
            <Cell align="right">{formatHermesUsageNumber(key.usageSummary?.totalTokens)}</Cell>
            <Cell align="right">{formatHermesUsageCost(key.usageSummary?.totalCostUsd)}</Cell>
            <Cell align="right">{key.limits?.length ?? 0}</Cell>
            <Cell>{formatDateTime(key.expiresAt)}</Cell>
          </tr>
        ))}
        {apiKeys.length === 0 ? <tr><Cell>No API keys returned.</Cell></tr> : null}
      </tbody>
    </DataTable>
  )
}

function HermesDashboardLogsPanel({ logs, accounts, total }: { logs: HermesDashboardRequestLog[]; accounts: HermesDashboardAccount[]; total?: number }) {
  const labels = useMemo(() => new Map(accounts.map((account) => [accountId(account), accountLabel(account)])), [accounts])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Showing {logs.length} of {formatHermesUsageNumber(total)}</div>
      <DataTable>
        <thead>
          <tr>
            <HeadCell>Time</HeadCell>
            <HeadCell>Account</HeadCell>
            <HeadCell>API key</HeadCell>
            <HeadCell>Model</HeadCell>
            <HeadCell>Transport</HeadCell>
            <HeadCell>Status</HeadCell>
            <HeadCell align="right">Tokens</HeadCell>
            <HeadCell align="right">Cost</HeadCell>
            <HeadCell>Error</HeadCell>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => (
            <tr key={`${log.requestedAt ?? ''}-${log.model ?? ''}-${index}`}>
              <Cell>{formatDateTime(log.requestedAt)}</Cell>
              <Cell>{log.accountId ? (labels.get(log.accountId) ?? log.accountId) : '--'}</Cell>
              <Cell>{log.apiKeyName ?? '--'}</Cell>
              <Cell>{shortModel(log.model)}</Cell>
              <Cell>{(log.transport ?? '--').toUpperCase()}</Cell>
              <Cell>{formatStatus(log.status)}</Cell>
              <Cell align="right">{formatHermesUsageNumber(log.tokens ?? undefined)}</Cell>
              <Cell align="right">{formatHermesUsageCost(log.costUsd ?? undefined)}</Cell>
              <Cell>{log.errorMessage || log.errorCode || '-'}</Cell>
            </tr>
          ))}
          {logs.length === 0 ? <tr><Cell>No request logs returned.</Cell></tr> : null}
        </tbody>
      </DataTable>
    </div>
  )
}
