import { api } from '@/lib/api'
import type { GrowthAnalyticsImportRow, GrowthConnectorStatus, GrowthOpsState, PostPackage, ViralVideo } from './growth-ops-types'
import { normalizeGrowthConnector, normalizeGrowthOpsState } from '@/features/growth-ops/domain'

interface ApiEnvelope<T> {
  ok: boolean
  data: T
}

function dataOrNull<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null
  const envelope = value as Partial<ApiEnvelope<T>>
  return envelope.ok === true && envelope.data != null ? envelope.data : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function objectRecord(value: unknown): Record<string, unknown> {
  return record(value)
}

export function growthStateHasRecords(state: GrowthOpsState): boolean {
  return (
    state.creatorWatchlist.length > 0 ||
    state.viralVideos.length > 0 ||
    state.contentRecipes.length > 0 ||
    state.contentIdeas.length > 0 ||
    state.postPackages.length > 0 ||
    state.metricSnapshots.length > 0 ||
    state.quarantinedAnalyticsRows.length > 0
  )
}

function rawGrowthStateHasRecords(value: unknown): boolean {
  const source = record(value)
  return [
    source.creatorWatchlist,
    source.viralVideos,
    source.contentRecipes,
    source.contentIdeas,
    source.postPackages,
    source.metricSnapshots,
    source.quarantinedAnalyticsRows,
  ].some(item => Array.isArray(item) && item.length > 0)
}

function normalizeConnector(value: unknown): GrowthConnectorStatus | null {
  return normalizeGrowthConnector(value)
}

function normalizePackage(value: unknown): PostPackage | null {
  const state = normalizeGrowthOpsState({ postPackages: [value] })
  return state.postPackages[0] ?? null
}

function normalizeRun(value: unknown): GrowthAgentRun | null {
  const source = record(value)
  if (!source.id) return null
  return {
    id: String(source.id),
    runType: String(source.run_type ?? source.runType ?? ''),
    status: String(source.status ?? 'blocked'),
    startedAt: String(source.started_at ?? source.startedAt ?? ''),
    completedAt: typeof source.completed_at === 'string' ? source.completed_at : typeof source.completedAt === 'string' ? source.completedAt : undefined,
    blockedReason:
      typeof source.blocked_reason === 'string'
        ? source.blocked_reason
        : typeof source.blockedReason === 'string'
          ? source.blockedReason
          : undefined,
    connectorStatuses: Array.isArray(source.connector_statuses)
      ? source.connector_statuses.map(normalizeConnector).filter((item): item is GrowthConnectorStatus => item != null)
      : Array.isArray(source.connectorStatuses)
        ? source.connectorStatuses.map(normalizeConnector).filter((item): item is GrowthConnectorStatus => item != null)
        : [],
    sourceCounts: objectRecord(source.source_counts ?? source.sourceCounts),
    createdRecordCounts: objectRecord(source.created_record_counts ?? source.createdRecordCounts),
    updatedRecordCounts: objectRecord(source.updated_record_counts ?? source.updatedRecordCounts),
  }
}

export interface GrowthAgentRun {
  id: string
  runType: string
  status: string
  startedAt: string
  completedAt?: string
  blockedReason?: string
  connectorStatuses: GrowthConnectorStatus[]
  sourceCounts: Record<string, unknown>
  createdRecordCounts: Record<string, unknown>
  updatedRecordCounts: Record<string, unknown>
}

export const growthOpsApi = {
  async getState(): Promise<{ state: GrowthOpsState; hasRecords: boolean } | null> {
    const response = await api.get<unknown>('/api/growth/state')
    const data = dataOrNull<unknown>(response)
    if (!data) return null
    return {
      state: normalizeGrowthOpsState(data),
      hasRecords: rawGrowthStateHasRecords(data),
    }
  },

  async putState(state: GrowthOpsState): Promise<GrowthOpsState | null> {
    const response = await api.put<unknown>('/api/growth/state', state)
    const data = dataOrNull<unknown>(response)
    return data ? normalizeGrowthOpsState(data) : null
  },

  async generateIdeas(): Promise<GrowthOpsState | null> {
    await api.post<unknown>('/api/growth/ideas/generate', {})
    const next = await growthOpsApi.getState()
    return next?.state ?? null
  },

  async addViralVideo(video: Omit<ViralVideo, 'id' | 'capturedAt' | 'source' | 'sourceConfidence'>): Promise<GrowthOpsState | null> {
    const response = await api.post<unknown>('/api/growth/viral-videos', video)
    const data = dataOrNull<unknown>(response)
    return data ? normalizeGrowthOpsState(data) : null
  },

  async previewAnalyticsImport(rows: Array<Record<string, string>> | string): Promise<GrowthAnalyticsImportRow[]> {
    const response = await api.post<unknown>('/api/growth/analytics/import/preview', { rows })
    const data = dataOrNull<{ preview?: unknown[] }>(response)
    return Array.isArray(data?.preview) ? (data.preview as GrowthAnalyticsImportRow[]) : []
  },

  async commitAnalyticsImport(previewRows: GrowthAnalyticsImportRow[]): Promise<{ state: GrowthOpsState | null; run: GrowthAgentRun | null }> {
    const response = await api.post<unknown>('/api/growth/analytics/import/commit', { previewRows })
    const data = dataOrNull<{ state?: unknown; run?: unknown }>(response)
    return {
      state: data?.state ? normalizeGrowthOpsState(data.state) : null,
      run: normalizeRun(data?.run),
    }
  },

  async upsertPostPackage(postPackage: PostPackage): Promise<GrowthOpsState | null> {
    const response = await api.post<unknown>('/api/growth/post-packages', postPackage)
    const data = dataOrNull<unknown>(response)
    return data ? normalizeGrowthOpsState(data) : null
  },

  async patchPostPackage(patch: Partial<PostPackage> & { id: string }): Promise<GrowthOpsState | null> {
    const response = await api.patch<unknown>('/api/growth/post-packages', patch)
    const data = dataOrNull<unknown>(response)
    return data ? normalizeGrowthOpsState(data) : null
  },

  async approvePostPackage(id: string): Promise<PostPackage | null> {
    const response = await api.post<unknown>(`/api/growth/post-packages/${encodeURIComponent(id)}/approve`, {})
    const data = dataOrNull<unknown>(response)
    return data ? normalizePackage(data) : null
  },

  async runWatchlistRefresh(): Promise<GrowthAgentRun | null> {
    const response = await api.post<unknown>('/api/growth/runs/watchlist-refresh', {})
    const data = dataOrNull<{ run?: unknown }>(response)
    return normalizeRun(data?.run)
  },

  async runCalendarPlanning(): Promise<{ run: GrowthAgentRun | null; state: GrowthOpsState | null }> {
    const response = await api.post<unknown>('/api/growth/runs/calendar-planning', {})
    const data = dataOrNull<{ run?: unknown; state?: unknown }>(response)
    return {
      run: normalizeRun(data?.run),
      state: data?.state ? normalizeGrowthOpsState(data.state) : null,
    }
  },

  async runOwnedAnalytics(): Promise<{ run: GrowthAgentRun | null; state: GrowthOpsState | null }> {
    const response = await api.post<unknown>('/api/growth/runs/owned-analytics', {})
    const data = dataOrNull<{ run?: unknown; state?: unknown }>(response)
    return {
      run: normalizeRun(data?.run),
      state: data?.state ? normalizeGrowthOpsState(data.state) : null,
    }
  },

  async runRecipeScoring(): Promise<{ run: GrowthAgentRun | null; state: GrowthOpsState | null }> {
    const response = await api.post<unknown>('/api/growth/runs/recipe-scoring', {})
    const data = dataOrNull<{ run?: unknown; state?: unknown }>(response)
    return {
      run: normalizeRun(data?.run),
      state: data?.state ? normalizeGrowthOpsState(data.state) : null,
    }
  },

  async runRecommendationRefresh(): Promise<{ run: GrowthAgentRun | null; state: GrowthOpsState | null }> {
    const response = await api.post<unknown>('/api/growth/runs/recommendation-refresh', {})
    const data = dataOrNull<{ run?: unknown; state?: unknown }>(response)
    return {
      run: normalizeRun(data?.run),
      state: data?.state ? normalizeGrowthOpsState(data.state) : null,
    }
  },

  async getRuns(): Promise<GrowthAgentRun[]> {
    const response = await api.get<unknown>('/api/growth/runs')
    const data = dataOrNull<{ runs?: unknown[] }>(response)
    return Array.isArray(data?.runs)
      ? data.runs.map(normalizeRun).filter((item): item is GrowthAgentRun => item != null)
      : []
  },

  async getConnectorStatus(): Promise<GrowthConnectorStatus[]> {
    const response = await api.get<unknown>('/api/growth/connectors/status')
    const data = dataOrNull<{ connectors?: unknown[] }>(response)
    return Array.isArray(data?.connectors)
      ? data.connectors.map(normalizeConnector).filter((item): item is GrowthConnectorStatus => item != null)
      : []
  },
}
