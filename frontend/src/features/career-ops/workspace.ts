import type {
  CareerProfile,
  CareerLane,
  CareerApplication,
  CareerOutcome,
  CareerSearchRun,
  JobForm,
  OpportunityDossier,
  SavedSearch,
  SearchSourceKey,
} from './types'
import {
  CASH_NOW_QUERIES,
  CAREER_OPS_MIGRATION_KEY,
  TARGET_PROFILE,
  defaultCareerProfile,
  evaluateDossier,
  generateDossierAssets,
  laneForDossier,
  loadCareerProfile,
  loadDossiers,
  loadTrackedLeads,
  migrateLeadToDossier,
  sortDossiersForQueue,
} from './domain'

export const DEFAULT_FORM: JobForm = {
  company: '',
  role: '',
  location: 'Remote - US',
  source: 'Manual',
  stage: 'sourcing',
  nextAction: 'Score opportunity and tailor assets',
  due: 'Today',
  priority: 'medium',
  tags: '',
  notes: '',
}

export const QUICK_SEARCHES = [
  'AI automation',
  'data annotation',
  'entry level IT',
  'computer engineering intern',
  'machine learning intern',
  'no experience',
]

export type OpportunityTrack = 'all' | CareerLane
export type CareerOpsView =
  | 'command'
  | 'cash-now'
  | 'engineering'
  | 'trainer'
  | 'applications'
  | 'pipeline'
  | 'packet'
  | 'settings'

export const CAREER_OPS_VIEWS: Array<{
  id: CareerOpsView
  label: string
  blurb: string
}> = [
  { id: 'command', label: 'Command', blurb: 'Cash-now queue, batches, follow-ups, interviews, and today.' },
  { id: 'cash-now', label: 'Cash Now', blurb: 'Fort Myers part-time and fast-hire roles at $18/hr+.' },
  { id: 'engineering', label: 'Career Track', blurb: 'Engineering, AI, IT, data, and internships.' },
  { id: 'trainer', label: 'Trainer Growth', blurb: 'Trainer jobs, coaching leads, and content opportunities.' },
  { id: 'applications', label: 'Applications', blurb: 'Prepare approved apply batches and browser-safe execution.' },
  { id: 'pipeline', label: 'Pipeline', blurb: 'Move dossiers through stages and follow-ups.' },
  { id: 'packet', label: 'Packet', blurb: 'Resume bullets, pitches, common answers, links, availability.' },
  { id: 'settings', label: 'Settings', blurb: 'Saved searches, sources, migration, and manual intake.' },
]

export const TRACK_CONFIG: Record<
  OpportunityTrack,
  {
    label: string
    blurb: string
    quickSearches: string[]
    intakeSource: string
    intakeAction: string
  }
> = {
  all: {
    label: 'All',
    blurb: 'Engineering search and trainer growth in one queue.',
    quickSearches: QUICK_SEARCHES,
    intakeSource: 'Manual',
    intakeAction: 'Score opportunity and tailor assets',
  },
  'cash-now': {
    label: 'Cash Now',
    blurb: 'Part-time Fort Myers work first: $18/hr floor, evening/weekend/flexible boosts, apply today.',
    quickSearches: CASH_NOW_QUERIES,
    intakeSource: 'Cash-now intake',
    intakeAction: 'Apply today, call/visit, then follow up same day',
  },
  engineering: {
    label: 'Engineering',
    blurb: 'Internships, remote work, projects, applications, and follow-ups.',
    quickSearches: [
      'computer engineering intern remote',
      'software engineering internship remote',
      'AI automation internship',
      'entry level IT remote',
      'data annotation engineering',
      'Fort Myers engineering internship',
    ],
    intakeSource: 'Engineering intake',
    intakeAction: 'Tailor resume, apply, and follow up',
  },
  trainer: {
    label: 'Trainer',
    blurb: 'Online coaching, socials, influencer research, content tests, and leads.',
    quickSearches: [
      'online fitness coaching content ideas',
      'personal trainer Fort Myers FGCU',
      'fitness influencer content analysis',
      'Instagram personal trainer lead magnets',
      'online coaching offer examples',
      'Amped Fitness trainer social posts',
    ],
    intakeSource: 'Trainer growth idea',
    intakeAction: 'Turn into content, outreach, or coaching offer test',
  },
}

export const SOURCE_OPTIONS: Array<{
  id: SearchSourceKey
  label: string
  description: string
}> = [
  {
    id: 'remotive',
    label: 'Remotive',
    description: 'Remote-first jobs with salary fields and a clean public API.',
  },
  {
    id: 'remoteok',
    label: 'Remote OK',
    description: 'Large remote jobs feed with direct employer links.',
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    description: 'Direct company postings with less board noise.',
  },
]

export function openExternal(url: string): boolean {
  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
}

export function applyProfileToDossier(dossier: OpportunityDossier, profile: CareerProfile): OpportunityDossier {
  return generateDossierAssets(evaluateDossier(dossier, profile), profile)
}

export function careerOpsMigratedToBackend(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem(CAREER_OPS_MIGRATION_KEY))
}

export function initialCareerProfile(): CareerProfile {
  return careerOpsMigratedToBackend() ? defaultCareerProfile() : loadCareerProfile()
}

export function initializeDossiers(profile: CareerProfile): OpportunityDossier[] {
  if (careerOpsMigratedToBackend()) return []

  const storedDossiers = sortDossiersForQueue(loadDossiers())
  if (storedDossiers.length > 0) return storedDossiers

  const legacyLeads = loadTrackedLeads()
    .map(migrateLeadToDossier)
    .map(dossier => applyProfileToDossier(dossier, profile))

  return sortDossiersForQueue(legacyLeads)
}

export function dossierMatchesTrack(dossier: OpportunityDossier, track: OpportunityTrack): boolean {
  if (track === 'all') return true
  return laneForDossier(dossier) === track
}

export function trackForView(view: CareerOpsView): OpportunityTrack {
  if (view === 'cash-now' || view === 'engineering' || view === 'trainer') return view
  return 'all'
}

export function laneForTrack(track: OpportunityTrack, fallback: CareerLane = 'engineering'): CareerLane {
  return track === 'all' ? fallback : track
}

export function laneForSavedSearch(search: SavedSearch): CareerLane {
  const text = `${search.name} ${search.query}`.toLowerCase()
  if (/trainer|fitness|gym|coach/.test(text)) return 'trainer'
  if (/cash|part time|part-time|fort myers|33905|server|warehouse|retail|weekend|evening|front desk/.test(text))
    return 'cash-now'
  return 'engineering'
}

export function formatPacketValue(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map(item => String(item))
      .filter(Boolean)
      .join(', ')
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join('\n')
  return String(value ?? '')
}

export interface PacketChecklistItem {
  label: string
  detail: string
  ok: boolean
}

export interface ConversionStat {
  lane: CareerLane
  source: string
  query: string
  total: number
  applied: number
  callbacks: number
  interviews: number
  offers: number
  rejected: number
  latestLesson: string
}

export function buildBatchPacketChecklist(profile: CareerProfile, candidates: OpportunityDossier[]): PacketChecklistItem[] {
  const packet = profile.resumePacket
  const lanes = new Set(candidates.map(laneForDossier))
  const hasLane = (lane: CareerLane) => lanes.size === 0 || lanes.has(lane)
  const linksCount = Object.values(profile.links ?? {}).filter(Boolean).length
  const proofCount = (packet?.workHistory.length ?? 0) + (packet?.projectProof.length ?? 0)
  const payFloors = profile.payFloors ?? {
    'cash-now': 18,
    engineering: profile.payFloor,
    trainer: 18,
  }

  return [
    {
      label: 'Availability',
      detail: profile.availability?.trim() || 'Add availability before batch apply.',
      ok: Boolean(profile.availability?.trim()),
    },
    {
      label: 'Base bullets',
      detail: `${packet?.baseBullets.length ?? 0} saved`,
      ok: (packet?.baseBullets.length ?? 0) > 0,
    },
    {
      label: 'Common pay answer',
      detail: packet?.commonAnswers.desiredPay || 'Add desired pay answer.',
      ok: Boolean(packet?.commonAnswers.desiredPay?.trim()),
    },
    {
      label: 'Cash-now floor',
      detail: `$${payFloors['cash-now'] ?? 18}/hr`,
      ok: !hasLane('cash-now') || (payFloors['cash-now'] ?? 0) >= 18,
    },
    {
      label: 'Cash-now cover',
      detail: packet?.coverTemplates['cash-now'] || 'Add cash-now note.',
      ok: !hasLane('cash-now') || Boolean(packet?.coverTemplates['cash-now']?.trim()),
    },
    {
      label: 'Engineering pitch',
      detail: packet?.engineeringPitch || 'Add engineering pitch.',
      ok: !hasLane('engineering') || Boolean(packet?.engineeringPitch?.trim()),
    },
    {
      label: 'Trainer pitch',
      detail: packet?.trainerPitch || 'Add trainer pitch.',
      ok: !hasLane('trainer') || Boolean(packet?.trainerPitch?.trim()),
    },
    {
      label: 'Proof bullets',
      detail: `${proofCount} work/project proof items`,
      ok: proofCount > 0 || lanes.size === 1 && lanes.has('cash-now'),
    },
    {
      label: 'Links',
      detail: `${linksCount} saved`,
      ok: linksCount > 0 || lanes.size === 1 && lanes.has('cash-now'),
    },
  ]
}

export function payFloorForLane(profile: CareerProfile, lane: CareerLane): number {
  return profile.payFloors?.[lane] ?? (lane === 'engineering' ? profile.payFloor : 18)
}

export function profileWithLanePayFloor(profile: CareerProfile, lane: CareerLane, payFloor: number): CareerProfile {
  return {
    ...profile,
    payFloor: lane === 'engineering' ? payFloor : profile.payFloor,
    payFloors: {
      'cash-now': profile.payFloors?.['cash-now'] ?? 18,
      engineering: profile.payFloors?.engineering ?? profile.payFloor,
      trainer: profile.payFloors?.trainer ?? 18,
      [lane]: payFloor,
    },
  }
}

export function applicationDossierLabel(application: CareerApplication, dossiers: OpportunityDossier[]): string {
  const dossier = dossiers.find(item => item.id === application.dossierId)
  if (dossier) return `${dossier.company} · ${dossier.role}`
  const snapshot = application.packetSnapshot.dossier
  if (snapshot && typeof snapshot === 'object') {
    const row = snapshot as Record<string, unknown>
    const company = typeof row.company === 'string' ? row.company : 'Saved company'
    const role = typeof row.role === 'string' ? row.role : 'Saved role'
    return `${company} · ${role}`
  }
  return application.dossierId
}

export function outcomeDossierLabel(outcome: CareerOutcome, dossiers: OpportunityDossier[]): string {
  const dossier = outcome.dossierId ? dossiers.find(item => item.id === outcome.dossierId) : null
  if (dossier) return `${dossier.company} · ${dossier.role}`
  return outcome.dossierId || outcome.applicationId || 'Outcome'
}

export function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

export function searchRunSourceLabel(run: CareerSearchRun): string {
  return run.sourceSet.length > 0 ? run.sourceSet.join(', ') : 'browser/public'
}

export function savedSearchLearningScore(search: SavedSearch, stats: ConversionStat[]): number {
  const searchQuery = search.query.trim().toLowerCase()
  if (!searchQuery) return 0
  return stats.reduce((score, stat) => {
    const statQuery = stat.query.trim().toLowerCase()
    if (!statQuery) return score
    const matches = statQuery === searchQuery || statQuery.includes(searchQuery) || searchQuery.includes(statQuery)
    if (!matches) return score
    return score + stat.offers * 30 + stat.interviews * 15 + stat.callbacks * 8 + stat.applied * 2 - stat.rejected * 5
  }, 0)
}

