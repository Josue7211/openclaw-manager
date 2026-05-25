export type HermesUsageWindowId = 'fiveHour' | 'weekly'

export interface HermesUsageWindow {
  id: HermesUsageWindowId
  label: string
  used?: number
  limit?: number
  remaining?: number
  percent?: number
  resetAt?: string
  status?: string
}

export interface HermesUsageAccount {
  id: string
  label: string
  used?: number
  limit?: number
  remaining?: number
  percent?: number
  status?: string
  resetAt?: string
  windows: HermesUsageWindow[]
}

export interface HermesUsageSummary {
  raw: unknown
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
  totalCost?: number
  used?: number
  limit?: number
  remaining?: number
  percent?: number
  period?: string
  resetAt?: string
  status?: string
  accounts: HermesUsageAccount[]
  windows: HermesUsageWindow[]
}

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function firstValue(record: RecordValue, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key]
  }
  return undefined
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[$,%\s,]/g, '')
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function withDerivedUsage(values: {
  used?: number
  limit?: number
  remaining?: number
  percent?: number
}): Pick<HermesUsageWindow, 'used' | 'limit' | 'remaining' | 'percent'> {
  let { used, limit, remaining, percent } = values
  if (used === undefined && limit !== undefined && remaining !== undefined) {
    used = Math.max(0, limit - remaining)
  }
  if (remaining === undefined && limit !== undefined && used !== undefined) {
    remaining = Math.max(0, limit - used)
  }
  if (percent === undefined && limit !== undefined && limit > 0 && used !== undefined) {
    percent = (used / limit) * 100
  }
  if (percent !== undefined) percent = clampPercent(percent)
  return { used, limit, remaining, percent }
}

function readUsageNumbers(record: RecordValue): Pick<HermesUsageWindow, 'used' | 'limit' | 'remaining' | 'percent'> {
  return withDerivedUsage({
    used: numberFrom(firstValue(record, ['used', 'used_tokens', 'usedTokens', 'tokensUsed', 'token_count', 'tokens'])),
    limit: numberFrom(firstValue(record, ['limit', 'token_limit', 'tokenLimit', 'quota', 'max', 'cap'])),
    remaining: numberFrom(firstValue(record, ['remaining', 'remaining_tokens', 'remainingTokens', 'left', 'available'])),
    percent: numberFrom(firstValue(record, ['percent', 'percentage', 'used_percent', 'usedPercent', 'percentUsed'])),
  })
}

function findWindowSource(record: RecordValue, id: HermesUsageWindowId): RecordValue | null {
  const directKeys = id === 'fiveHour'
    ? ['fiveHour', 'five_hour', 'five_hour_limit', 'fiveHourLimit', '5h', 'fiveHourUsage']
    : ['weekly', 'week', 'weekly_limit', 'weeklyLimit', 'weeklyUsage']
  for (const key of directKeys) {
    const value = record[key]
    if (isRecord(value)) return value
  }

  const limits = record.limits
  if (isRecord(limits)) {
    for (const key of directKeys) {
      const value = limits[key]
      if (isRecord(value)) return value
    }
  }

  return null
}

function windowFromRecord(record: RecordValue, id: HermesUsageWindowId): HermesUsageWindow | null {
  const source = findWindowSource(record, id)
  const label = id === 'fiveHour' ? '5h' : 'Week'
  if (!source) {
    const prefixKeys = id === 'fiveHour'
      ? {
          used: ['fiveHourUsed', 'five_hour_used', 'used_5h', 'fiveHourTokens'],
          limit: ['fiveHourLimit', 'five_hour_limit', 'limit_5h'],
          remaining: ['fiveHourRemaining', 'five_hour_remaining', 'remaining_5h'],
          resetAt: ['fiveHourResetAt', 'five_hour_reset_at', 'reset_5h'],
        }
      : {
          used: ['weeklyUsed', 'weekly_used', 'weekUsed', 'week_used'],
          limit: ['weeklyLimit', 'weekly_limit', 'weekLimit', 'week_limit'],
          remaining: ['weeklyRemaining', 'weekly_remaining', 'weekRemaining', 'week_remaining'],
          resetAt: ['weeklyResetAt', 'weekly_reset_at', 'weekResetAt', 'week_reset_at'],
        }
    const derived = withDerivedUsage({
      used: numberFrom(firstValue(record, prefixKeys.used)),
      limit: numberFrom(firstValue(record, prefixKeys.limit)),
      remaining: numberFrom(firstValue(record, prefixKeys.remaining)),
    })
    if (derived.used === undefined && derived.limit === undefined && derived.remaining === undefined) return null
    return {
      id,
      label,
      ...derived,
      resetAt: stringFrom(firstValue(record, prefixKeys.resetAt)),
    }
  }

  const derived = readUsageNumbers(source)
  return {
    id,
    label: stringFrom(firstValue(source, ['label', 'name'])) ?? label,
    ...derived,
    resetAt: stringFrom(firstValue(source, ['resetAt', 'reset_at', 'reset', 'resetsAt', 'resets_at'])),
    status: stringFrom(firstValue(source, ['status', 'state'])),
  }
}

function windowsFromRecord(record: RecordValue): HermesUsageWindow[] {
  return [
    windowFromRecord(record, 'fiveHour'),
    windowFromRecord(record, 'weekly'),
  ].filter((window): window is HermesUsageWindow => Boolean(window))
}

function accountEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  if (isRecord(value)) return Object.entries(value)
  return []
}

function accountFromEntry(entryKey: string, value: unknown): HermesUsageAccount | null {
  if (!isRecord(value)) return null
  const rawLabel = stringFrom(firstValue(value, ['label', 'name', 'email', 'account', 'user', 'username', 'id']))
  const label = rawLabel ?? (entryKey && !/^\d+$/.test(entryKey) ? entryKey : '')
  if (!label) return null
  const usage = readUsageNumbers(value)
  const windows = windowsFromRecord(value)
  return {
    id: stringFrom(firstValue(value, ['id', 'accountId', 'account_id'])) ?? label,
    label,
    ...usage,
    status: stringFrom(firstValue(value, ['status', 'state'])),
    resetAt: stringFrom(firstValue(value, ['resetAt', 'reset_at', 'reset', 'resetsAt', 'resets_at'])),
    windows,
  }
}

function accountsFromUsage(record: RecordValue): HermesUsageAccount[] {
  const source = firstValue(record, ['accounts', 'users', 'members'])
  return accountEntries(source)
    .map(([key, value]) => accountFromEntry(key, value))
    .filter((account): account is HermesUsageAccount => Boolean(account))
}

export function normalizeHermesUsage(raw: unknown): HermesUsageSummary | null {
  if (!isRecord(raw)) return null
  const usage = readUsageNumbers(raw)
  const totalTokens = numberFrom(firstValue(raw, ['total_tokens', 'totalTokens', 'tokens', 'token_count']))
  const summary: HermesUsageSummary = {
    raw,
    totalTokens,
    promptTokens: numberFrom(firstValue(raw, ['prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens'])),
    completionTokens: numberFrom(firstValue(raw, ['completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens'])),
    totalCost: numberFrom(firstValue(raw, ['total_cost', 'totalCost', 'cost', 'spend'])),
    ...usage,
    period: stringFrom(firstValue(raw, ['period', 'window', 'windowLabel'])),
    resetAt: stringFrom(firstValue(raw, ['resetAt', 'reset_at', 'reset', 'resetsAt', 'resets_at'])),
    status: stringFrom(firstValue(raw, ['status', 'state'])),
    accounts: accountsFromUsage(raw),
    windows: windowsFromRecord(raw),
  }
  return summary
}

export function formatHermesUsageNumber(value: number | undefined, suffix = ''): string {
  if (value === undefined) return '--'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M${suffix}`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k${suffix}`
  return `${value.toLocaleString()}${suffix}`
}

export function formatHermesUsageCost(value: number | undefined): string {
  return value === undefined ? '--' : `$${value.toFixed(2)}`
}

export function formatHermesUsagePercent(value: number | undefined): string {
  return value === undefined ? '--' : `${Math.round(value)}%`
}

export function formatHermesUsageReset(value: string | undefined): string {
  if (!value) return '--'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function hermesUsageCompactLabel(summary: HermesUsageSummary | null): string {
  if (!summary) return 'Hermes'
  const fiveHour = summary.windows.find((window) => window.id === 'fiveHour')
  if (fiveHour?.percent !== undefined) return `5h ${formatHermesUsagePercent(fiveHour.percent)}`
  if (summary.remaining !== undefined) return `${formatHermesUsageNumber(summary.remaining)} left`
  if (summary.used !== undefined) return `${formatHermesUsageNumber(summary.used)} used`
  if (summary.totalTokens !== undefined) return `${formatHermesUsageNumber(summary.totalTokens)} tok`
  if (summary.totalCost !== undefined) return formatHermesUsageCost(summary.totalCost)
  return 'Hermes'
}

export type CodexLbUsageWindowId = HermesUsageWindowId
export type CodexLbUsageWindow = HermesUsageWindow
export type CodexLbUsageAccount = HermesUsageAccount
export type CodexLbUsageSummary = HermesUsageSummary
export const normalizeCodexLbUsage = normalizeHermesUsage
export const formatCodexUsageNumber = formatHermesUsageNumber
export const formatCodexUsageCost = formatHermesUsageCost
export const formatCodexUsagePercent = formatHermesUsagePercent
export const formatCodexUsageReset = formatHermesUsageReset
export const codexUsageCompactLabel = hermesUsageCompactLabel
