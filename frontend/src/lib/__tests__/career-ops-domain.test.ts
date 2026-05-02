import { beforeEach, describe, expect, it } from 'vitest'
import type { DossierRecommendation, LiveJob, OpportunityDossier } from '@/pages/job-hunter-types'
import {
  createDossierFromJob,
  createDossierFromManualIntake,
  defaultCareerProfile,
  evaluateDossier,
  generateDossierAssets,
  loadDossiers,
  migrateLeadToDossier,
  sortDossiersForQueue,
} from '@/pages/job-hunter-domain'

const sampleJob: LiveJob = {
  id: '1',
  source: 'Remotive',
  sourceId: 'remotive-1',
  title: 'Junior Automation Engineer',
  company: 'Acme',
  category: 'Software Development',
  jobType: 'Full-time',
  location: 'Remote - US',
  salary: '$70,000 - $90,000',
  publishedAt: new Date().toISOString(),
  url: 'https://example.com/jobs/1',
  summary: 'Build AI automation tooling and internal workflows.',
}

beforeEach(() => {
  localStorage.clear()
})

describe('career ops dossier domain', () => {
  it('creates a dossier from a live job with seeded overview data', () => {
    const dossier = createDossierFromJob(sampleJob)
    expect(dossier.company).toBe('Acme')
    expect(dossier.role).toBe('Junior Automation Engineer')
    expect(dossier.source.kind).toBe('live-search')
    expect(dossier.assets.resumeBullets).toEqual([])
  })

  it('evaluates a dossier into pursue, hold, or skip with reasons', () => {
    const dossier = createDossierFromJob(sampleJob)
    const evaluated = evaluateDossier(dossier)
    expect(['pursue', 'hold', 'skip']).toContain(evaluated.evaluation.recommendation)
    expect(evaluated.evaluation.reasonsToPursue.length + evaluated.evaluation.reasonsToAvoid.length).toBeGreaterThan(0)
  })

  it('migrates a tracked lead into a dossier timeline-safe shape', () => {
    const dossier = migrateLeadToDossier({
      id: 'lead-1',
      company: 'Acme',
      role: 'Junior Automation Engineer',
      location: 'Remote',
      source: 'Manual',
      stage: 'applied',
      nextAction: 'Follow up Friday',
      due: 'Friday',
      priority: 'high',
      tags: ['automation'],
      notes: 'Strong fit',
    })

    expect(dossier.stage).toBe('applied')
    expect(dossier.timeline[0]?.type).toBe('migrated')
  })

  it('sorts dossiers by recommendation, urgency, and freshness', () => {
    const newestToday: OpportunityDossier = {
      ...createDossierFromJob(sampleJob),
      id: 'today-new',
      due: 'Today',
      updatedAt: '2024-01-02T00:00:00.000Z',
      evaluation: {
        fitScore: 90,
        recommendation: 'hold' as DossierRecommendation,
        reasonsToPursue: [],
        reasonsToAvoid: [],
        riskFlags: [],
        confidenceGaps: [],
      },
    }
    const olderToday: OpportunityDossier = {
      ...newestToday,
      id: 'today-old',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    const lowerFitToday: OpportunityDossier = {
      ...newestToday,
      id: 'today-lower-fit',
      evaluation: { ...newestToday.evaluation, fitScore: 70 },
    }
    const tomorrow: OpportunityDossier = {
      ...newestToday,
      id: 'tomorrow',
      due: 'Tomorrow',
      updatedAt: '2024-01-03T00:00:00.000Z',
      evaluation: { ...newestToday.evaluation, fitScore: 100 },
    }

    const sorted = sortDossiersForQueue([tomorrow, olderToday, lowerFitToday, newestToday])
    expect(sorted.map(item => item.id)).toEqual(['today-new', 'today-old', 'today-lower-fit', 'tomorrow'])
  })

  it('creates a dossier from manual intake text without a feed job', () => {
    const dossier = createDossierFromManualIntake({
      company: 'Beta Corp',
      role: 'IT Support Specialist',
      location: 'Fort Myers, FL',
      description: 'Entry-level support role with ticketing and device setup.',
      sourceLabel: 'Manual paste',
      sourceUrl: '',
    })

    expect(dossier.source.kind).toBe('manual')
    expect(dossier.notes).toContain('Entry-level support role')
  })

  it('generates deterministic dossier assets from dossier facts and profile strengths', () => {
    const profile = {
      ...defaultCareerProfile(),
      strengths: ['workflow automation', 'technical support triage', 'fast learning'],
      narrative: 'Computer engineering student who ships practical automation.',
    }

    const evaluated = evaluateDossier(createDossierFromJob(sampleJob), profile)
    const next = generateDossierAssets(evaluated, profile)

    expect(next.assets.resumeBullets).toHaveLength(3)
    expect(next.assets.resumeBullets[0]).toContain('Acme')
    expect(next.assets.resumeBullets.join(' ')).toContain('workflow automation')
    expect(next.assets.coverNote).toContain('Junior Automation Engineer')
    expect(next.assets.coverNote).toContain('Acme')
    expect(next.assets.outreachBlurb).toContain('technical support triage')
    expect(next.assets.interviewPrompts[0]).toContain('Acme')
    expect(next.timeline[0]?.type).toBe('asset-generated')
  })

  it('normalizes corrupted dossiers from localStorage with fallback timeline and timestamps', () => {
    localStorage.setItem('career-ops-dossiers', JSON.stringify([
      {
        id: 'broken-1',
        company: 'Acme',
        role: 'Automation Engineer',
        location: 'Remote - US',
        source: { kind: 'manual', label: 'Manual' },
        salaryText: '',
        estimatedHourlyRate: null,
        summary: 'Broken payload',
        stage: 'sourcing',
        nextAction: 'Review',
        due: 'Today',
        tags: ['automation'],
        notes: 'Some notes',
        createdAt: 'not-a-date',
        updatedAt: 'still-not-a-date',
        evaluation: { fitScore: 12, recommendation: 'hold' },
        assets: { resumeBullets: 'bad', coverNote: null, outreachBlurb: null, interviewPrompts: [] },
        timeline: [{ nope: true }],
      },
      {
        id: 'broken-2',
        company: 'Beta',
        role: 'Support Specialist',
        location: 'Fort Myers, FL',
        source: { kind: 'live-search', label: 'Remotive' },
        salaryText: '$25/hr',
        estimatedHourlyRate: 25,
        summary: 'Another broken payload',
        stage: 'applied',
        nextAction: 'Follow up',
        due: 'Tomorrow',
        tags: null,
        notes: 'Notes',
        createdAt: '2024-13-99',
        updatedAt: '2024-01-02T00:00:00.000Z',
        evaluation: null,
        assets: null,
        timeline: [],
      },
    ]))

    const dossiers = loadDossiers()
    expect(dossiers).toHaveLength(2)
    expect(dossiers[0].timeline).toHaveLength(1)
    expect(dossiers[0].timeline[0]?.type).toBe('created')
    expect(dossiers[0].createdAt).toBe('1970-01-01T00:00:00.000Z')
    expect(dossiers[0].updatedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(dossiers[1].timeline).toHaveLength(1)
    expect(dossiers[1].timeline[0]?.type).toBe('created')
    expect(dossiers[1].createdAt).toBe('1970-01-01T00:00:00.000Z')
    expect(dossiers[1].updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })
})
