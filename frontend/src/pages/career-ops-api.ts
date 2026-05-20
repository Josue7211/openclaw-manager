import { api } from '@/lib/api'
import type {
  CareerApplication,
  CareerLane,
  CareerOutcome,
  CareerProfile,
  CareerSearchRun,
  ExecutedApplicationBatch,
  LiveJob,
  OpportunityDossier,
  PreparedApplicationBatch,
  SavedSearch,
  SearchSourceKey,
} from '@/features/career-ops/types'
import {
  defaultCareerProfile,
  evaluateDossier,
  generateDossierAssets,
  laneForDossier,
  normalizeTags,
  sortDossiersForQueue,
} from '@/features/career-ops/domain'

interface ApiEnvelope<T> {
  ok: boolean
  data: T
}

interface BackendDossier {
  id: string
  company: string
  role: string
  location: string
  lane?: CareerLane
  stage: OpportunityDossier['stage']
  source?: Record<string, unknown>
  sourceUrl?: string | null
  score?: number
  recommendation?: string
  nextAction: string
  due: string
  salaryText: string
  estimatedHourlyRate?: number | null
  summary: string
  tags?: unknown
  notes: string
  evaluation?: unknown
  assets?: unknown
  timeline?: unknown
  fingerprint?: string
  createdAt: string
  updatedAt: string
}

interface BackendSavedSearch {
  id: string
  name: string
  query: string
  lane?: CareerLane
  sourceSet?: unknown
  filters?: unknown
  createdAt?: string
  updatedAt?: string
}

function dataOrNull<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null
  const envelope = value as Partial<ApiEnvelope<T>>
  return envelope.ok === true && envelope.data != null ? envelope.data : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function searchSourceArray(value: unknown): SearchSourceKey[] {
  const allowed = new Set<SearchSourceKey>(['remotive', 'remoteok', 'arbeitnow'])
  return stringArray(value).filter((item): item is SearchSourceKey => allowed.has(item as SearchSourceKey))
}

function normalizeSavedSearch(value: BackendSavedSearch): SavedSearch {
  const filters = record(value.filters)
  const mode =
    filters.mode === 'remote-first' || filters.mode === 'hybrid-ok' || filters.mode === 'local-fallback'
      ? filters.mode
      : value.lane === 'cash-now' || value.lane === 'trainer'
        ? 'local-fallback'
        : 'remote-first'
  const sources = searchSourceArray(value.sourceSet)
  return {
    id: value.id,
    name: value.name,
    query: value.query,
    mode,
    lifeMode: filters.lifeMode === 'employed' ? 'employed' : 'unemployed',
    sources: sources.length > 0 ? sources : ['remotive', 'remoteok', 'arbeitnow'],
    smartFilter: filters.smartFilter !== false,
    minimumHourlyRate: typeof filters.minimumHourlyRate === 'number' ? filters.minimumHourlyRate : 18,
    createdAt: value.createdAt ?? value.updatedAt ?? new Date().toISOString(),
  }
}

export function careerProfileFromBackend(value: unknown): CareerProfile | null {
  const source = record(value)
  if (typeof source.id !== 'string') return null
  const defaults = defaultCareerProfile()
  const payFloors = record(source.payFloors) as Record<CareerLane, number>
  const resumePacket = record(source.resumePacket)
  return {
    ...defaults,
    targetRoles: stringArray(source.targetRoles).length > 0 ? stringArray(source.targetRoles) : defaults.targetRoles,
    payFloor: typeof payFloors.engineering === 'number' ? payFloors.engineering : defaults.payFloor,
    preferredLocations:
      stringArray(source.locations).length > 0 ? stringArray(source.locations) : defaults.preferredLocations,
    narrative: typeof source.narrative === 'string' ? source.narrative : defaults.narrative,
    strengths: stringArray(source.strengths).length > 0 ? stringArray(source.strengths) : defaults.strengths,
    lanes: stringArray(source.lanes) as CareerLane[],
    payFloors: { ...defaults.payFloors!, ...payFloors },
    availability: typeof source.availability === 'string' ? source.availability : defaults.availability,
    resumePacket: {
      ...defaults.resumePacket!,
      ...resumePacket,
      baseBullets:
        stringArray(resumePacket.baseBullets).length > 0
          ? stringArray(resumePacket.baseBullets)
          : defaults.resumePacket!.baseBullets,
      workHistory: stringArray(resumePacket.workHistory),
      projectProof: stringArray(resumePacket.projectProof),
      coverTemplates: {
        ...defaults.resumePacket!.coverTemplates,
        ...record(resumePacket.coverTemplates),
      } as NonNullable<CareerProfile['resumePacket']>['coverTemplates'],
      commonAnswers: {
        ...defaults.resumePacket!.commonAnswers,
        ...stringRecord(resumePacket.commonAnswers),
      },
    },
    links: stringRecord(source.links),
  }
}

export function backendDossierToOpportunity(
  value: BackendDossier,
  profile = defaultCareerProfile(),
): OpportunityDossier {
  const source = record(value.source)
  const dossier: OpportunityDossier = {
    id: value.id,
    company: value.company,
    role: value.role,
    location: value.location,
    lane: value.lane,
    source: {
      kind: 'live-search',
      label:
        typeof source.source === 'string'
          ? source.source
          : typeof source.kind === 'string'
            ? source.kind
            : 'Career Ops',
      sourceId: typeof source.feedId === 'string' ? source.feedId : value.id,
      url: value.sourceUrl ?? undefined,
    },
    salaryText: value.salaryText ?? '',
    estimatedHourlyRate: typeof value.estimatedHourlyRate === 'number' ? value.estimatedHourlyRate : null,
    summary: value.summary ?? '',
    stage: value.stage,
    nextAction: value.nextAction,
    due: value.due,
    tags: stringArray(value.tags),
    notes: value.notes ?? '',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    evaluation: record(value.evaluation) as unknown as OpportunityDossier['evaluation'],
    assets: record(value.assets) as unknown as OpportunityDossier['assets'],
    timeline: Array.isArray(value.timeline) ? (value.timeline as OpportunityDossier['timeline']) : [],
    fingerprint: value.fingerprint,
  }
  return generateDossierAssets(evaluateDossier(dossier, profile), profile)
}

export function dossierToBackendPayload(dossier: OpportunityDossier) {
  return {
    id: dossier.id,
    company: dossier.company,
    role: dossier.role,
    location: dossier.location,
    lane: laneForDossier(dossier),
    stage: dossier.stage,
    source: {
      kind: dossier.source.kind,
      label: dossier.source.label,
      sourceId: dossier.source.sourceId,
    },
    sourceUrl: dossier.source.url,
    score: dossier.evaluation.fitScore,
    recommendation: dossier.evaluation.recommendation,
    nextAction: dossier.nextAction,
    due: dossier.due,
    salaryText: dossier.salaryText,
    estimatedHourlyRate: dossier.estimatedHourlyRate,
    summary: dossier.summary,
    tags: dossier.tags,
    notes: dossier.notes,
    evaluation: dossier.evaluation,
    assets: dossier.assets,
    timeline: dossier.timeline,
    fingerprint: dossier.fingerprint,
  }
}

export function profileToBackendPayload(profile: CareerProfile) {
  const defaults = defaultCareerProfile()
  return {
    lanes: profile.lanes ?? defaults.lanes,
    payFloors: profile.payFloors ?? {
      ...defaults.payFloors!,
      engineering: profile.payFloor,
    },
    locations: profile.preferredLocations,
    strengths: profile.strengths,
    resumePacket: profile.resumePacket ?? defaults.resumePacket,
    links: profile.links ?? {},
    availability: profile.availability ?? defaults.availability,
  }
}

function backendApplication(value: unknown): CareerApplication {
  const source = record(value)
  return {
    id: String(source.id ?? ''),
    dossierId: String(source.dossierId ?? source.dossier_id ?? ''),
    batchId: typeof source.batchId === 'string' ? source.batchId : null,
    status: String(source.status ?? 'prepared'),
    submitMode: String(source.submitMode ?? source.submit_mode ?? 'browser-assisted'),
    preparedAnswers: record(source.preparedAnswers),
    packetSnapshot: record(source.packetSnapshot),
    requiredFields: stringArray(source.requiredFields),
    riskFlags: stringArray(source.riskFlags),
    audit: Array.isArray(source.audit)
      ? source.audit.filter((item): item is Record<string, unknown> => typeof item === 'object' && item != null)
      : [],
    createdAt: String(source.createdAt ?? ''),
    updatedAt: String(source.updatedAt ?? ''),
  }
}

function backendOutcome(value: unknown): CareerOutcome | null {
  const source = record(value)
  const outcome = String(source.outcome ?? '')
  if (!['callback', 'rejection', 'interview', 'offer', 'ignored'].includes(outcome)) return null
  return {
    id: String(source.id ?? ''),
    dossierId: typeof source.dossierId === 'string' ? source.dossierId : null,
    applicationId: typeof source.applicationId === 'string' ? source.applicationId : null,
    outcome: outcome as CareerOutcome['outcome'],
    callbackQuality: typeof source.callbackQuality === 'string' ? source.callbackQuality : null,
    pay: typeof source.pay === 'string' ? source.pay : null,
    lesson: typeof source.lesson === 'string' ? source.lesson : '',
    metadata: record(source.metadata),
    createdAt: String(source.createdAt ?? ''),
    updatedAt: String(source.updatedAt ?? ''),
  }
}

function backendSearchRun(value: unknown): CareerSearchRun | null {
  const source = record(value)
  const lane = typeof source.lane === 'string' ? (source.lane as CareerLane) : 'cash-now'
  if (!['cash-now', 'engineering', 'trainer'].includes(lane)) return null
  return {
    id: String(source.id ?? ''),
    lane,
    query: String(source.query ?? ''),
    sourceSet: stringArray(source.sourceSet),
    filters: record(source.filters),
    resultCount: typeof source.resultCount === 'number' ? source.resultCount : 0,
    dedupeFingerprints: stringArray(source.dedupeFingerprints),
    createdDossierIds: stringArray(source.createdDossierIds),
    createdAt: String(source.createdAt ?? ''),
    updatedAt: String(source.updatedAt ?? ''),
  }
}

function normalizePreparedBatch(value: unknown, profile: CareerProfile): PreparedApplicationBatch | null {
  const data = record(value)
  if (typeof data.batchId !== 'string') return null
  const applications = Array.isArray(data.applications)
    ? data.applications.map(item => {
        const row = record(item)
        return {
          application: backendApplication(row.application),
          dossier: backendDossierToOpportunity(row.dossier as BackendDossier, profile),
        }
      })
    : []
  return {
    batchId: data.batchId,
    applications,
    approval: data.approval as PreparedApplicationBatch['approval'],
  }
}

function normalizeExecutedBatch(value: unknown): ExecutedApplicationBatch | null {
  const data = record(value)
  if (typeof data.batchId !== 'string') return null
  const browserTasks = Array.isArray(data.browserTasks)
    ? data.browserTasks
        .map(task => {
          const row = record(task)
          return {
            applicationId: String(row.applicationId ?? ''),
            dossierId: String(row.dossierId ?? ''),
            company: String(row.company ?? ''),
            role: String(row.role ?? ''),
            url: String(row.url ?? ''),
            answers: record(row.answers),
            requiredFields: stringArray(row.requiredFields),
            hardStops: stringArray(row.hardStops),
            fillMode: typeof row.fillMode === 'string' ? row.fillMode : undefined,
            fillInstructions: typeof row.fillInstructions === 'string' ? row.fillInstructions : undefined,
            fillScript: typeof row.fillScript === 'string' ? row.fillScript : undefined,
          }
        })
        .filter(task => task.applicationId && task.url)
    : []
  return {
    batchId: data.batchId,
    status: String(data.status ?? ''),
    hardStops: stringArray(data.hardStops),
    applications: Array.isArray(data.applications) ? data.applications.map(backendApplication) : [],
    browserTasks,
  }
}

export const careerOpsApi = {
  async getSyncStatus(): Promise<{
    sqliteTables: Record<string, boolean>
    migration?: {
      path?: string
      applyCommand?: string
      checkCommand?: string
    }
    supabase: {
      configured: boolean
      reachable: boolean
      careerTablesDetected: boolean
      status: string
      httpStatus?: number
      missingTables?: string[]
      failedTables?: string[]
    }
  } | null> {
    const response = await api.get<unknown>('/api/career/sync-status')
    return dataOrNull(response)
  },

  async getProfile(): Promise<CareerProfile | null> {
    const response = await api.get<unknown>('/api/career/profile')
    return careerProfileFromBackend(dataOrNull(response))
  },

  async putProfile(profile: CareerProfile): Promise<void> {
    await api.put('/api/career/profile', profileToBackendPayload(profile))
  },

  async listDossiers(profile: CareerProfile): Promise<OpportunityDossier[]> {
    const response = await api.get<unknown>('/api/career/dossiers')
    const data = dataOrNull<{ dossiers?: BackendDossier[] }>(response)
    if (!Array.isArray(data?.dossiers)) return []
    return sortDossiersForQueue(data.dossiers.map(item => backendDossierToOpportunity(item, profile)))
  },

  async upsertDossier(dossier: OpportunityDossier): Promise<void> {
    await api.post('/api/career/dossiers', dossierToBackendPayload(dossier))
  },

  async listApplications(): Promise<CareerApplication[]> {
    const response = await api.get<unknown>('/api/career/applications')
    const data = dataOrNull<{ applications?: unknown[] }>(response)
    if (!Array.isArray(data?.applications)) return []
    return data.applications.map(backendApplication).filter(application => application.id && application.dossierId)
  },

  async listOutcomes(): Promise<CareerOutcome[]> {
    const response = await api.get<unknown>('/api/career/outcomes')
    const data = dataOrNull<{ outcomes?: unknown[] }>(response)
    if (!Array.isArray(data?.outcomes)) return []
    return data.outcomes.map(backendOutcome).filter((outcome): outcome is CareerOutcome => Boolean(outcome?.id))
  },

  async listSearchRuns(): Promise<CareerSearchRun[]> {
    const response = await api.get<unknown>('/api/career/search/runs')
    const data = dataOrNull<{ searchRuns?: unknown[] }>(response)
    if (!Array.isArray(data?.searchRuns)) return []
    return data.searchRuns.map(backendSearchRun).filter((run): run is CareerSearchRun => Boolean(run?.id))
  },

  async patchDossier(dossier: OpportunityDossier): Promise<void> {
    await api.patch('/api/career/dossiers', dossierToBackendPayload(dossier))
  },

  async deleteDossier(id: string): Promise<void> {
    await api.del('/api/career/dossiers', { id })
  },

  async listSavedSearches(): Promise<SavedSearch[]> {
    const response = await api.get<unknown>('/api/career/saved-searches')
    const data = dataOrNull<{ savedSearches?: BackendSavedSearch[] }>(response)
    if (!Array.isArray(data?.savedSearches)) return []
    return data.savedSearches
      .filter(item => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.query === 'string')
      .map(normalizeSavedSearch)
  },

  async saveSearch(search: SavedSearch, lane: CareerLane): Promise<void> {
    await api.post('/api/career/saved-searches', {
      id: search.id,
      name: search.name,
      query: search.query,
      lane,
      sourceSet: search.sources,
      schedule: { kind: 'manual' },
      filters: {
        mode: search.mode,
        lifeMode: search.lifeMode,
        smartFilter: search.smartFilter,
        minimumHourlyRate: search.minimumHourlyRate,
      },
    })
  },

  async updateSearch(search: SavedSearch, lane: CareerLane): Promise<void> {
    await api.patch('/api/career/saved-searches', {
      id: search.id,
      name: search.name,
      query: search.query,
      lane,
      sourceSet: search.sources,
      schedule: { kind: 'manual' },
      filters: {
        mode: search.mode,
        lifeMode: search.lifeMode,
        smartFilter: search.smartFilter,
        minimumHourlyRate: search.minimumHourlyRate,
      },
    })
  },

  async deleteSearch(id: string): Promise<void> {
    await api.del('/api/career/saved-searches', { id })
  },

  async recordSearchRun(input: { lane: CareerLane; query: string; sources: string[]; jobs: LiveJob[] }): Promise<void> {
    await api.post('/api/career/search/run', {
      lane: input.lane,
      query: input.query,
      sourceSet: input.sources,
      filters: { source: 'public-feeds-plus-browser-links' },
      jobs: input.jobs.map(job => ({
        id: job.id,
        role: job.title,
        company: job.company,
        location: job.location,
        source: job.source,
        sourceUrl: job.url,
        salaryText: job.salary,
        summary: job.summary,
        jobType: job.jobType,
        tags: normalizeTags([job.category, job.jobType].join(', ')),
      })),
    })
  },

  async prepareBatch(dossierIds: string[], profile: CareerProfile): Promise<PreparedApplicationBatch | null> {
    const response = await api.post<unknown>('/api/career/applications/prepare-batch', {
      dossierIds,
      maxSubmitCount: dossierIds.length,
    })
    return normalizePreparedBatch(dataOrNull(response), profile)
  },

  async executeBatch(batchId: string, capability: string): Promise<ExecutedApplicationBatch | null> {
    const response = await api.post<unknown>('/api/career/applications/execute-batch', { batchId, capability })
    return normalizeExecutedBatch(dataOrNull(response))
  },

  async recordApplicationEvent(input: {
    applicationId: string
    event: 'browser_opened' | 'browser_open_blocked' | 'fill_helper_viewed' | 'hard_stop_detected'
    url?: string
    note?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await api.post('/api/career/applications/events', input)
  },

  async recordOutcome(input: {
    dossierId?: string
    applicationId?: string
    outcome: 'callback' | 'rejection' | 'interview' | 'offer' | 'ignored'
    pay?: string
    lesson?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await api.post('/api/career/outcomes', input)
  },
}
