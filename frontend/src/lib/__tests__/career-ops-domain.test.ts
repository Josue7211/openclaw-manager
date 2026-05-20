import { beforeEach, describe, expect, it } from 'vitest'
import type { DossierRecommendation, GrowthOpsState, LiveJob, OpportunityDossier, ViralVideo } from '@/features/career-ops/types'
import {
  GROWTH_OPS_LOCAL_STORAGE_KEY,
  GROWTH_OPS_MIGRATED_KEY,
  GROWTH_OPS_STORAGE_KEY,
  addManualViralVideo,
  approvePostPackage,
  buildLaneBrowserSearches,
  createPostPackageFromIdea,
  createDossierFromJob,
  createDossierFromManualIntake,
  defaultCareerProfile,
  defaultCareerSavedSearches,
  defaultGrowthOpsState,
  evaluateDossier,
  generateDailyContentIdeas,
  generateDossierAssets,
  growthMetricScore,
  loadDossiers,
  loadGrowthOpsState,
  migrateLeadToDossier,
  rankCashNowJobCards,
  sortDossiersForQueue,
  updateRecipeLearning,
  validatePostPackage,
} from '@/features/career-ops/domain'

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

  it('builds browser search launchers across public job sources', () => {
    const cashNow = buildLaneBrowserSearches('cash-now')
    const engineering = buildLaneBrowserSearches('engineering')

    expect(cashNow.map(item => item.label)).toContain('part time Fort Myers $18')
    expect(cashNow.map(item => item.label)).toContain('Google Jobs: hiring immediately')
    expect(cashNow.map(item => item.label)).toContain('Company: Publix')
    expect(cashNow.map(item => item.label)).toContain('Company: Amped Fitness')
    expect(cashNow.some(item => item.url.includes('indeed.com'))).toBe(true)
    expect(cashNow.some(item => item.url.includes('linkedin.com'))).toBe(true)
    expect(cashNow.some(item => item.url.includes('craigslist.org'))).toBe(true)
    expect(cashNow.length).toBeGreaterThanOrEqual(25)
    expect(engineering.some(item => item.url.includes('linkedin.com'))).toBe(true)
    expect(engineering.some(item => item.url.includes('indeed.com'))).toBe(true)
  })

  it('seeds saved searches for cash-now, career track, and trainer growth', () => {
    const searches = defaultCareerSavedSearches()

    expect(searches.map(search => search.name)).toEqual([
      'Cash Now: Fort Myers $18+',
      'Cash Now: evening/weekend',
      'Career Track: entry AI/IT',
      'Trainer Growth: gym/client leads',
    ])
    expect(searches[0].minimumHourlyRate).toBe(18)
    expect(searches.every(search => search.lifeMode === 'unemployed')).toBe(true)
    expect(searches.every(search => search.sources.includes('remotive'))).toBe(true)
  })

  it('ranks local part-time cash-now $18/hr roles above remote career-track roles', () => {
    const localCashNowJob: LiveJob = {
      ...sampleJob,
      id: 'cash-now-local',
      sourceId: 'cash-now-local',
      title: 'Front Desk Associate',
      company: 'Fort Myers Fitness',
      category: 'Customer service',
      jobType: 'Part-time',
      location: 'Fort Myers, FL',
      salary: '$18/hr',
      summary: 'Part-time front desk role hiring immediately with flexible evening and weekend shifts.',
    }
    const remoteCareerTrackJob: LiveJob = {
      ...sampleJob,
      id: 'career-remote',
      sourceId: 'career-remote',
      title: 'Junior AI Automation Analyst',
      company: 'Remote Career Co',
      category: 'Software Development',
      jobType: 'Full-time',
      location: 'Remote - US',
      salary: '$70,000 - $90,000',
      summary: 'Remote career-track automation role for entry-level engineering growth.',
    }

    const ranked = rankCashNowJobCards([remoteCareerTrackJob, localCashNowJob])

    expect(ranked[0]?.job.id).toBe('cash-now-local')
    expect(ranked[0]?.analysis.signals).toEqual(expect.arrayContaining(['Local', 'Fast cash', 'Meets $18/hr']))
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

  it('generates cash-now call and same-day follow-up scripts', () => {
    const profile = {
      ...defaultCareerProfile(),
      availability: 'Flexible ASAP',
      payFloors: { 'cash-now': 18, engineering: 20, trainer: 18 },
    }
    const dossier = createDossierFromManualIntake({
      company: 'Cash Cafe',
      role: 'Server',
      location: 'Fort Myers, FL',
      description: 'Part-time evening server role hiring immediately at $18/hr.',
      sourceLabel: 'Cash-now intake',
    })

    const next = generateDossierAssets(evaluateDossier({ ...dossier, lane: 'cash-now' }, profile), profile)

    expect(next.assets.callScript).toContain('fastest way to be considered')
    expect(next.assets.followUpNote).toContain('$18/hr+')
    expect(next.assets.coverNote).toContain('Fort Myers')
    expect(next.assets.interviewPrompts.join(' ')).toContain('training start')
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

describe('growth ops domain', () => {
  it('seeds a fitness watchlist and science-based lifting recipes', () => {
    const state = defaultGrowthOpsState()

    expect(state.creatorWatchlist.map(creator => creator.displayName)).toEqual(
      expect.arrayContaining(['Hussein', 'Alex Eubank', 'Jeff Nippard']),
    )
    expect(state.contentRecipes.some(recipe => recipe.name.includes('Myth-bust'))).toBe(true)
    expect(state.postPackages).toEqual([])
  })

  it('generates 10 daily ideas and marks the top 3 for today', () => {
    const ideas = generateDailyContentIdeas(defaultGrowthOpsState(), new Date('2026-05-14T12:00:00.000Z'))

    expect(ideas).toHaveLength(10)
    expect(ideas.filter(idea => idea.makeToday)).toHaveLength(3)
    expect(ideas[0].platformVariants.tiktok).toContain('TikTok')
    expect(ideas[0].hashtags).toContain('sciencebasedlifting')
  })

  it('dedupes manually captured viral videos and updates recipe learning', () => {
    const state = defaultGrowthOpsState()
    const video: Omit<ViralVideo, 'id' | 'capturedAt' | 'source'> = {
      platform: 'tiktok',
      creatorHandle: 'science_lifter',
      url: 'https://tiktok.example/video/1',
      hook: 'Most lifters get squat depth wrong because they chase depth without tension.',
      topic: 'science-based lifting squat depth myth',
      format: 'hook + gym demo + CTA',
      lengthSeconds: 32,
      metrics: {
        views: 100000,
        likes: 12000,
        comments: 500,
        shares: 1200,
        saves: 3000,
        watchRetention: 74,
        leadSignal: 3,
      },
      notes: 'Clear visual cue and coaching CTA.',
    }

    const once = addManualViralVideo(state, video)
    const twice = addManualViralVideo(once, video)

    expect(twice.viralVideos).toHaveLength(1)
    expect(growthMetricScore(twice.viralVideos[0].metrics)).toBeGreaterThan(100)
    expect(twice.contentRecipes.some(recipe => recipe.status === 'winning' || recipe.status === 'promising')).toBe(true)
  })

  it('validates post packages before approval and blocks missing videos', () => {
    const idea = generateDailyContentIdeas(defaultGrowthOpsState(), new Date('2026-05-14T12:00:00.000Z'))[0]
    const postPackage = createPostPackageFromIdea(idea, '2026-05-15T12:00:00.000Z')

    expect(postPackage.approvalState).toBe('needs-video')
    expect(postPackage.validationErrors.join(' ')).toContain('vertical video file')

    const blocked = approvePostPackage(postPackage)
    expect(blocked.approvalState).toBe('blocked')

    const ready = validatePostPackage({ ...postPackage, videoFile: '/tmp/squat-depth.mp4' })
    expect(ready.approvalState).toBe('ready-for-approval')
    expect(approvePostPackage(ready).approvalState).toBe('queued')
  })

  it('loads corrupted growth ops storage with defaults intact', () => {
    localStorage.setItem(GROWTH_OPS_STORAGE_KEY, JSON.stringify({ creatorWatchlist: [], contentRecipes: [] }))

    const loaded = loadGrowthOpsState()

    expect(loaded.creatorWatchlist.length).toBeGreaterThan(0)
    expect(loaded.contentRecipes.length).toBeGreaterThan(0)
  })

  it('migrates local growth V1 state into normalized V2.5 storage once', () => {
    const legacy = {
      ...defaultGrowthOpsState(),
      viralVideos: [
        {
          id: 'viral-legacy',
          platform: 'tiktok',
          creatorHandle: 'science_lifter',
          url: 'https://www.tiktok.example/video/1?utm_source=test',
          hook: 'Most lifters get squat depth wrong.',
          topic: 'squat depth myth',
          format: 'hook demo cta',
          lengthSeconds: 30,
          metrics: { views: 1000, likes: 100, comments: 10, shares: 5, saves: 20 },
          notes: '',
          source: 'manual-link',
          capturedAt: '2026-05-14T12:00:00.000Z',
        },
      ],
    } satisfies GrowthOpsState
    localStorage.setItem(GROWTH_OPS_STORAGE_KEY, JSON.stringify(legacy))

    const first = loadGrowthOpsState()
    const migratedAt = localStorage.getItem(GROWTH_OPS_MIGRATED_KEY)
    const second = loadGrowthOpsState()

    expect(first.viralVideos).toHaveLength(1)
    expect(second.viralVideos).toHaveLength(1)
    expect(localStorage.getItem(GROWTH_OPS_MIGRATED_KEY)).toBe(migratedAt)
    expect(localStorage.getItem(GROWTH_OPS_LOCAL_STORAGE_KEY)).toBeTruthy()
  })

  it('uses owned metric snapshots in the learning loop', () => {
    const state: GrowthOpsState = {
      ...defaultGrowthOpsState(),
      metricSnapshots: [
        {
          id: 'metric-1',
          postPackageId: 'post-1',
          platform: 'instagram',
          measuredAt: '2026-05-14T12:00:00.000Z',
          horizon: '24h',
          metrics: {
            views: 50000,
            likes: 7000,
            comments: 200,
            shares: 800,
            saves: 2500,
            watchRetention: 68,
            followerDelta: 120,
            leadSignal: 8,
          },
        },
      ],
    }

    const learned = updateRecipeLearning(state)

    expect(learned.contentRecipes[0].baselineScore).toBeGreaterThan(state.contentRecipes[0].baselineScore)
    expect(['winning', 'promising', 'testing']).toContain(learned.contentRecipes[0].status)
  })
})
