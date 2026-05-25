import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import JobHunterPage from '@/pages/JobHunter'
import type { LiveJob } from '@/pages/job-hunter-types'
import { recommendApplication, shouldAutoQueueBrowserReview } from '@/pages/job-hunter-domain'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPut = vi.fn()
const apiPatch = vi.fn()
const apiDel = vi.fn()

vi.setConfig({ testTimeout: 45000 })

const eligibleEntryLevelJob: LiveJob = {
  id: 'job-1',
  source: 'Remotive',
  sourceId: 'remotive-1',
  title: 'IT Support Specialist',
  company: 'Beta Corp',
  category: 'IT',
  jobType: 'Full-time',
  location: 'Remote - US',
  salary: '$25/hr',
  publishedAt: new Date().toISOString(),
  url: 'https://example.com/jobs/1',
  summary: 'Entry-level support role with direct employer application.',
}

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    put: (...args: unknown[]) => apiPut(...args),
    patch: (...args: unknown[]) => apiPatch(...args),
    del: (...args: unknown[]) => apiDel(...args),
  },
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JobHunterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openCareerOpsView(_user: ReturnType<typeof userEvent.setup>, label: string) {
  const nav = screen.getByRole('navigation', { name: 'Career Ops navigation' })
  const labelNode = within(nav).getByText(label)
  const button = labelNode.closest('button')
  expect(button).not.toBeNull()
  fireEvent.click(button as HTMLButtonElement)
}

function makeStoredDossier(overrides: Record<string, unknown>) {
  return {
    id: 'dossier-default',
    company: 'Default Co',
    role: 'Default Role',
    location: 'Remote - US',
    source: {
      kind: 'manual',
      label: 'Manual paste',
    },
    salaryText: '',
    estimatedHourlyRate: 30,
    summary: 'Default summary.',
    stage: 'applied',
    nextAction: 'Default next action',
    due: 'Today',
    tags: [],
    notes: 'Default notes',
    createdAt: '2026-04-08T12:00:00.000Z',
    updatedAt: '2026-04-09T09:00:00.000Z',
    evaluation: {
      fitScore: 70,
      recommendation: 'pursue',
      reasonsToPursue: ['Default reason'],
      reasonsToAvoid: [],
      riskFlags: [],
      confidenceGaps: [],
    },
    assets: {
      resumeBullets: [],
      coverNote: '',
      outreachBlurb: '',
      interviewPrompts: [],
    },
    timeline: [
      {
        id: 'event-default',
        type: 'created',
        at: '2026-04-08T12:00:00.000Z',
        label: 'Created from manual intake',
      },
    ],
    ...overrides,
  }
}

describe('CareerOpsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
    apiGet.mockResolvedValue({
      query: '',
      count: 0,
      jobs: [],
    })
    apiPost.mockResolvedValue({ ok: true, data: {} })
    apiPut.mockResolvedValue({ ok: true, data: {} })
    apiPatch.mockResolvedValue({ ok: true, data: {} })
    apiDel.mockResolvedValue({ ok: true, data: {} })
  })

  it('shows Career Ops branding and renders the opportunity queue from dossiers', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        {
          id: 'dossier-1',
          company: 'Acme',
          role: 'Automation Analyst',
          location: 'Remote - US',
          source: {
            kind: 'manual',
            label: 'Manual paste',
          },
          salaryText: '',
          estimatedHourlyRate: 32,
          summary: 'Strong automation fit.',
          stage: 'applied',
          nextAction: 'Send follow-up note',
          due: 'Today',
          tags: ['automation'],
          notes: 'Saved from manual intake',
          createdAt: '2026-04-08T12:00:00.000Z',
          updatedAt: '2026-04-09T09:00:00.000Z',
          evaluation: {
            fitScore: 82,
            recommendation: 'pursue',
            reasonsToPursue: ['Matches target role family'],
            reasonsToAvoid: ['Requires stronger systems examples'],
            riskFlags: ['Needs proof of support volume handled'],
            confidenceGaps: ['Hiring manager tooling stack not listed'],
          },
          assets: {
            resumeBullets: ['Built automation workflows that reduced manual triage time.'],
            coverNote: 'Tailor cover note around support automation and reporting.',
            outreachBlurb: 'Reaching out because this role overlaps with workflow automation work.',
            interviewPrompts: ['How does the team measure ticket resolution quality?'],
          },
          timeline: [
            {
              id: 'event-1',
              type: 'created',
              at: '2026-04-08T12:00:00.000Z',
              label: 'Created from manual intake',
            },
          ],
        },
      ]),
    )

    renderPage()

    expect(await screen.findByText('Career Ops')).toBeInTheDocument()
    expect(screen.getByText('Opportunity queue')).toBeInTheDocument()
    expect(screen.getByText('Automation Analyst')).toBeInTheDocument()
    expect(screen.getAllByText(/Acme/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Send follow-up note').length).toBeGreaterThan(0)
    expect(screen.getByText('Fit assessment')).toBeInTheDocument()
    expect(screen.getByText('Generated assets')).toBeInTheDocument()
    expect(screen.getByText('Next actions')).toBeInTheDocument()
    expect(screen.getByText('Needs proof of support volume handled')).toBeInTheDocument()
    expect(screen.getByText('Built automation workflows that reduced manual triage time.')).toBeInTheDocument()
  })

  it('keeps Growth Ops out of the Career Ops subnavigation', async () => {
    renderPage()

    await screen.findByText('Career Ops')

    const nav = screen.getByRole('navigation', { name: 'Career Ops navigation' })
    expect(within(nav).queryByText('Growth Ops')).not.toBeInTheDocument()
  })

  it('shows cash-now call and same-day follow-up scripts in the dossier detail', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'cash-script',
          company: 'Cash Cafe',
          role: 'Server',
          location: 'Fort Myers, FL',
          lane: 'cash-now',
          summary: 'Part-time server role hiring immediately.',
          assets: {
            resumeBullets: [],
            coverNote: '',
            outreachBlurb: '',
            interviewPrompts: [],
            callScript: 'Hi, I am calling about Server at Cash Cafe. What is the fastest way to be considered?',
            followUpNote: 'Hi Cash Cafe team, I applied or reached out today about Server.',
          },
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Call or visit script')).toBeInTheDocument()
    expect(screen.getByText(/fastest way to be considered/)).toBeInTheDocument()
    expect(screen.getByText('Same-day follow-up')).toBeInTheDocument()
    expect(screen.getByText(/applied or reached out today/)).toBeInTheDocument()
  })

  it('shows default saved searches when no saved searches exist yet', async () => {
    renderPage()

    expect(await screen.findByText('Career Ops')).toBeInTheDocument()
    expect(screen.getByText('Cash Now: Fort Myers $18+')).toBeInTheDocument()
    expect(screen.getByText('Career Track: entry AI/IT')).toBeInTheDocument()
    expect(screen.getByText('Trainer Growth: gym/client leads')).toBeInTheDocument()
  })

  it('seeds default saved searches into the backend when backend searches are empty', async () => {
    renderPage()

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/saved-searches',
        expect.objectContaining({
          id: 'default-cash-now-part-time-fort-myers',
          lane: 'cash-now',
          query: 'part time Fort Myers $18',
        }),
      )
    })
    expect(apiPost).toHaveBeenCalledWith(
      '/api/career/saved-searches',
      expect.objectContaining({
        id: 'default-trainer-growth',
        lane: 'trainer',
      }),
    )
  })

  it('removes saved searches through the backend instead of only hiding them locally', async () => {
    renderPage()

    expect(await screen.findByText('Cash Now: Fort Myers $18+')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved search Cash Now: Fort Myers $18+' }))

    await waitFor(() => {
      expect(apiDel).toHaveBeenCalledWith('/api/career/saved-searches', {
        id: 'default-cash-now-part-time-fort-myers',
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('Cash Now: Fort Myers $18+')).not.toBeInTheDocument()
    })
  })

  it('updates a saved search through backend PATCH with current filters', async () => {
    renderPage()

    fireEvent.change(await screen.findByLabelText('Search live job openings'), {
      target: { value: 'warehouse part time Fort Myers' },
    })
    fireEvent.change(screen.getByLabelText('Minimum hourly rate'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update saved search Cash Now: Fort Myers $18+' }))

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        '/api/career/saved-searches',
        expect.objectContaining({
          id: 'default-cash-now-part-time-fort-myers',
          query: 'warehouse part time Fort Myers',
          lane: 'cash-now',
          filters: expect.objectContaining({
            minimumHourlyRate: 21,
          }),
        }),
      )
    })
  })

  it('starts a cash-now blitz by opening and tracking local browser searches', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Start cash-now blitz' }))

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledTimes(12)
      const dossierPosts = apiPost.mock.calls.filter(([path]) => path === '/api/career/dossiers')
      expect(dossierPosts).toHaveLength(12)
      expect(dossierPosts[0][1]).toMatchObject({
        role: 'Fast-hire search target',
        lane: 'cash-now',
        nextAction: 'Open search, apply today, call or visit if listed',
      })
    })
    expect(screen.getByText(/Opened and tracked 12 cash-now searches/)).toBeInTheDocument()
  })

  it('creates a dossier from manual pasted intake text', async () => {
    const user = userEvent.setup()

    renderPage()

    await openCareerOpsView(user, 'Packet')
    fireEvent.change(screen.getByLabelText('Pay floor'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Core strengths'), { target: { value: 'workflow automation' } })

    await openCareerOpsView(user, 'Settings')
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Beta Corp' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'IT Support Specialist' } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Fort Myers, FL' } })
    fireEvent.change(screen.getByLabelText('Pasted description'), {
      target: { value: 'Entry-level support role with ticketing, device setup, and onsite troubleshooting.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }))

    expect(await screen.findByText('IT Support Specialist')).toBeInTheDocument()
    expect(screen.getAllByText(/Beta Corp/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Score opportunity and tailor assets/).length).toBeGreaterThan(0)

    await waitFor(() => {
      const betaCall = apiPost.mock.calls.find(([path, payload]) => {
        const dossier = payload as { company?: string } | null
        return path === '/api/career/dossiers' && dossier?.company === 'Beta Corp'
      })

      expect(betaCall).toBeTruthy()

      const payload = betaCall?.[1] as {
        assets: { coverNote: string; resumeBullets: string[] }
      }
      expect(payload).toMatchObject({
        company: 'Beta Corp',
        role: 'IT Support Specialist',
        source: {
          kind: 'manual',
        },
        notes: expect.stringContaining('Entry-level support role'),
        evaluation: expect.objectContaining({
          confidenceGaps: expect.arrayContaining(['Compensation not listed']),
        }),
      })
      expect(payload.assets.coverNote).toContain('Beta Corp')
      expect(payload.assets.resumeBullets.join('\n')).toContain('workflow automation')
    })
  })

  it('lets the user update pay floor strategy and persists the profile', async () => {
    const user = userEvent.setup()

    renderPage()

    await openCareerOpsView(user, 'Packet')
    await user.clear(screen.getByLabelText('engineering pay floor'))
    await user.type(screen.getByLabelText('engineering pay floor'), '30')

    expect(screen.getByLabelText('engineering pay floor')).toHaveValue(30)

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith(
        '/api/career/profile',
        expect.objectContaining({
          payFloors: expect.objectContaining({
            engineering: 30,
          }),
        }),
      )
    })
  })

  it('persists the active cash-now search floor into lane-specific profile strategy', async () => {
    const user = userEvent.setup()

    renderPage()

    await openCareerOpsView(user, 'Cash Now')
    fireEvent.change(await screen.findByLabelText('Minimum hourly rate'), { target: { value: '22' } })

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith(
        '/api/career/profile',
        expect.objectContaining({
          payFloors: expect.objectContaining({
            'cash-now': 22,
          }),
        }),
      )
    })
  })

  it('keeps targeted entry-level roles on the manual Indeed path when salary is present', () => {
    const recommendation = recommendApplication(eligibleEntryLevelJob)

    expect(recommendation.mode).toBe('manual')
    expect(recommendation.route).toBe('indeed')
    expect(recommendation.label).toBe('Search Indeed')
  })

  it('treats manual target roles as browser-assist candidates when they are fresh and above pay floor', () => {
    expect(shouldAutoQueueBrowserReview(eligibleEntryLevelJob, 20)).toBe(true)
  })

  it('auto-queues eligible target jobs into the browser review queue', async () => {
    apiGet.mockResolvedValue({
      query: 'it support remote',
      count: 1,
      jobs: [eligibleEntryLevelJob],
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('IT Support Specialist')).toHaveLength(2)
    })
  })

  it('records live cash-now search runs into the backend dossier pipeline', async () => {
    const cashNowJob: LiveJob = {
      ...eligibleEntryLevelJob,
      id: 'cash-now-1',
      sourceId: 'cash-now-source-1',
      title: 'Front Desk Associate',
      company: 'Fort Myers Fitness',
      category: 'Customer service',
      jobType: 'Part-time',
      location: 'Fort Myers, FL',
      salary: '$18/hr',
      summary: 'Part-time front desk role hiring immediately with evening shifts.',
    }
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/jobs/search')) {
        return Promise.resolve({
          query: 'part time Fort Myers $18',
          count: 1,
          jobs: [cashNowJob],
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    renderPage()

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/search/run',
        expect.objectContaining({
          lane: 'cash-now',
          query: expect.stringContaining('part time Fort Myers $18'),
          jobs: expect.arrayContaining([
            expect.objectContaining({
              role: 'Front Desk Associate',
              company: 'Fort Myers Fitness',
              location: 'Fort Myers, FL',
            }),
          ]),
        }),
      )
    })
    await waitFor(() => {
      expect(apiGet.mock.calls.filter(([path]) => String(path).includes('/api/career/dossiers')).length).toBeGreaterThan(
        1,
      )
    })
  })

  it('shows trackable browser searches when live job feeds fail', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/jobs/search')) return Promise.reject(new Error('Job feed unavailable'))
      if (path.includes('/api/career/dossiers')) return Promise.resolve({ ok: true, data: [] })
      if (path.includes('/api/career/sync-status')) {
        return Promise.resolve({
          ok: true,
          data: {
            sqliteTables: {
              career_profiles: true,
              career_dossiers: true,
              career_applications: true,
              career_saved_searches: true,
              career_outcomes: true,
              career_search_runs: true,
            },
            supabase: { configured: true, status: 'career_tables_missing' },
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    const user = userEvent.setup()
    renderPage()

    await openCareerOpsView(user, 'Cash Now')

    expect(await screen.findByText('Live feeds paused')).toBeInTheDocument()
    expect(screen.getAllByText('part time Fort Myers $18').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Track' })[0])

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/dossiers',
        expect.objectContaining({
          company: 'part time Fort Myers $18',
          role: 'Fast-hire search target',
          lane: 'cash-now',
          nextAction: 'Open search and apply today',
        }),
      )
    })
  })

  it('shows exact missing Supabase career tables in sync status', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/career/sync-status')) {
        return Promise.resolve({
          ok: true,
          data: {
            sqliteTables: {
              career_profiles: true,
              career_dossiers: true,
              career_applications: true,
              career_saved_searches: true,
              career_outcomes: true,
              career_search_runs: true,
            },
            migration: {
              path: 'supabase/migrations/20260512000000_career_ops.sql',
              applyCommand: 'npm run career:apply-supabase',
              checkCommand: 'npm run career:check',
            },
            supabase: {
              configured: true,
              reachable: true,
              careerTablesDetected: false,
              status: 'career_tables_missing',
              httpStatus: 404,
              missingTables: ['career_profiles', 'career_dossiers'],
              failedTables: ['career_profiles', 'career_dossiers'],
            },
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    const user = userEvent.setup()
    renderPage()

    await openCareerOpsView(user, 'Settings')

    expect(await screen.findByText(/Missing Supabase tables: career_profiles, career_dossiers/)).toBeInTheDocument()
    expect(screen.getByText('supabase/migrations/20260512000000_career_ops.sql')).toBeInTheDocument()
    expect(screen.getByText('npm run career:apply-supabase')).toBeInTheDocument()
    expect(screen.getByText('npm run career:check')).toBeInTheDocument()
    expect(screen.getByText('CAREER_OPS_ALLOW_NPX_SUPABASE=1')).toBeInTheDocument()
    expect(screen.getByText('CAREER_OPS_SUPABASE_DB_URL_BW_ITEM')).toBeInTheDocument()
    expect(screen.getByText('BW_SESSION')).toBeInTheDocument()
  })

  it('moves an existing dossier to applied when the live job is marked applied', async () => {
    apiGet.mockResolvedValue({
      query: 'it support remote',
      count: 1,
      jobs: [eligibleEntryLevelJob],
    })

    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'job-1-dossier',
          company: 'Beta Corp',
          role: 'IT Support Specialist',
          stage: 'sourcing',
          source: {
            kind: 'live-search',
            label: 'Remotive',
            sourceId: 'remotive-1',
            url: 'https://example.com/jobs/1',
          },
          nextAction: 'Review fit and tailor application assets',
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('IT Support Specialist')).toBeInTheDocument()
    const openButton = await screen.findByRole('button', { name: 'Open' })
    const liveJobCard = openButton.closest('article')

    expect(liveJobCard).not.toBeNull()

    fireEvent.click(within(liveJobCard as HTMLElement).getByRole('button', { name: 'Applied' }))

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        '/api/career/dossiers',
        expect.objectContaining({
          id: 'job-1-dossier',
          stage: 'applied',
        }),
      )
    })
    const stored = JSON.parse(localStorage.getItem('career-ops-dossiers') ?? '[]')
    if (!localStorage.getItem('career-ops-sqlite-migrated-v1')) {
      expect(stored[0]).toMatchObject({
        id: 'job-1-dossier',
        stage: 'applied',
      })
    }
  })

  it('migrates legacy tracked leads into dossiers and persists them', async () => {
    localStorage.setItem(
      'job-hunter-tracked-leads',
      JSON.stringify([
        {
          id: 'legacy-1',
          company: 'Legacy Labs',
          role: 'QA Support Specialist',
          location: 'Remote - US',
          source: 'Manual',
          stage: 'applied',
          nextAction: 'Send follow-up email',
          due: 'Today',
          priority: 'high',
          tags: ['legacy', 'support'],
          notes: 'Strong fit from older tracker',
        },
      ]),
    )

    renderPage()

    expect(await screen.findByText('QA Support Specialist')).toBeInTheDocument()
    expect(screen.getAllByText(/Legacy Labs/).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/dossiers',
        expect.objectContaining({
          id: 'legacy-1',
          company: 'Legacy Labs',
          role: 'QA Support Specialist',
          stage: 'applied',
        }),
      )
    })
  })

  it('does not use legacy localStorage dossiers as primary after backend migration', async () => {
    localStorage.setItem('career-ops-sqlite-migrated-v1', '2026-05-12T12:00:00.000Z')
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'stale-local',
          company: 'Stale Local Co',
          role: 'Stale Local Role',
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Career Ops')).toBeInTheDocument()
    expect(screen.queryByText('Stale Local Role')).not.toBeInTheDocument()
  })

  it('does not use legacy localStorage saved searches as primary after backend migration', async () => {
    localStorage.setItem('career-ops-sqlite-migrated-v1', '2026-05-12T12:00:00.000Z')
    localStorage.setItem(
      'job-hunter-saved-searches',
      JSON.stringify([
        {
          id: 'stale-search',
          name: 'Stale local saved search',
          query: 'stale local query',
          mode: 'remote-only',
          lifeMode: 'unemployed',
          sources: ['remotive'],
          smartFilter: true,
          minimumHourlyRate: 18,
          createdAt: '2026-05-12T12:00:00.000Z',
        },
      ]),
    )

    renderPage()

    expect(await screen.findByText('Career Ops')).toBeInTheDocument()
    expect(screen.queryByText('Stale local saved search')).not.toBeInTheDocument()
    expect(screen.getByText('Cash Now: Fort Myers $18+')).toBeInTheDocument()
  })

  it('does not mark backend migration complete when any legacy write fails', async () => {
    apiPost.mockImplementation((path: string, payload: unknown) => {
      const dossier = payload as { id?: string } | null
      if (path === '/api/career/dossiers' && dossier?.id === 'legacy-fail') {
        return Promise.reject(new Error('SQLite write failed'))
      }
      return Promise.resolve({ ok: true, data: {} })
    })
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'legacy-fail',
          company: 'Risky Local Co',
          role: 'Must Preserve',
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Must Preserve')).toBeInTheDocument()
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/dossiers',
        expect.objectContaining({
          id: 'legacy-fail',
        }),
      )
    })
    await waitFor(() => {
      expect(localStorage.getItem('career-ops-sqlite-migrated-v1')).toBeNull()
    })
  })

  it('extracts a specific location from the pasted description and replaces the default location', async () => {
    const user = userEvent.setup()

    renderPage()

    await openCareerOpsView(user, 'Settings')
    expect(screen.getByLabelText('Location')).toHaveValue('Remote - US')

    fireEvent.change(screen.getByLabelText('Pasted description'), {
      target: { value: 'Role: Support Specialist. Location: Austin, TX. Handle ticketing and onsite device setup.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Extract from description' }))

    expect(screen.getByLabelText('Location')).toHaveValue('Austin, TX')
  })

  it('removes the no-op priority control from intake', async () => {
    const user = userEvent.setup()

    renderPage()

    await openCareerOpsView(user, 'Settings')
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument()
  })

  it('updates the detail panel when a different dossier is selected from the queue', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'dossier-1',
          company: 'Acme',
          role: 'Automation Analyst',
          summary: 'Automation detail summary.',
          nextAction: 'Send follow-up note',
          evaluation: {
            fitScore: 82,
            recommendation: 'pursue',
            reasonsToPursue: ['Matches target role family'],
            reasonsToAvoid: [],
            riskFlags: ['Needs proof of support volume handled'],
            confidenceGaps: [],
          },
        }),
        makeStoredDossier({
          id: 'dossier-2',
          company: 'Beacon Health',
          role: 'Support Specialist',
          summary: 'Support detail summary.',
          nextAction: 'Tailor resume for support workflows',
          evaluation: {
            fitScore: 64,
            recommendation: 'hold',
            reasonsToPursue: ['Good support fit'],
            reasonsToAvoid: ['Lower automation exposure'],
            riskFlags: ['Onsite rotation unclear'],
            confidenceGaps: ['Comp band missing'],
          },
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Automation detail summary.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /select support specialist at beacon health/i }))

    expect(screen.getByText('Beacon Health')).toBeInTheDocument()
    expect(screen.getByText('Support detail summary.')).toBeInTheDocument()
    expect(screen.getByText('Onsite rotation unclear')).toBeInTheDocument()
  })

  it('resets dossier detail to the visible filtered queue when the current selection is filtered out', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'dossier-applied',
          company: 'Applied Labs',
          role: 'Applied Analyst',
          stage: 'applied',
          summary: 'Applied summary.',
        }),
        makeStoredDossier({
          id: 'dossier-offer',
          company: 'Offer Works',
          role: 'Offer Engineer',
          stage: 'offer',
          summary: 'Offer summary.',
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Applied Labs')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /select offer engineer at offer works/i }))
    expect(screen.getByText('Offer summary.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Applied' }))

    await waitFor(() => {
      expect(screen.getByText('Applied summary.')).toBeInTheDocument()
      expect(screen.queryByText('Offer summary.')).not.toBeInTheDocument()
    })
  })

  it('keeps skipped opportunities out of the action queue', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'dossier-pursue',
          company: 'Pursue Co',
          role: 'Automation Coordinator',
          nextAction: 'Send tailored application',
          evaluation: {
            fitScore: 80,
            recommendation: 'pursue',
            reasonsToPursue: ['Strong fit'],
            reasonsToAvoid: [],
            riskFlags: [],
            confidenceGaps: [],
          },
        }),
        makeStoredDossier({
          id: 'dossier-skip',
          company: 'Skip Co',
          role: 'Generic Operator',
          nextAction: 'Do not surface this action',
          evaluation: {
            fitScore: 30,
            recommendation: 'skip',
            reasonsToPursue: [],
            reasonsToAvoid: ['Poor fit'],
            riskFlags: ['Low pay'],
            confidenceGaps: [],
          },
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Action queue')).toBeInTheDocument()
    expect(screen.getByText('Send tailored application (Today)')).toBeInTheDocument()
    expect(screen.queryByText('Do not surface this action (Today)')).not.toBeInTheDocument()
    expect(screen.getByText('Generic Operator')).toBeInTheDocument()
  })

  it('creates real follow-up reminders from due Career Ops actions', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'cash-reminder',
          company: 'Cash Cafe',
          role: 'Server',
          lane: 'cash-now',
          stage: 'sourcing',
          nextAction: 'Apply today and call before 4 PM',
          due: 'Today',
          evaluation: {
            fitScore: 88,
            recommendation: 'pursue',
            reasonsToPursue: ['Fast local cash-now role'],
            reasonsToAvoid: [],
            riskFlags: [],
            confidenceGaps: [],
          },
        }),
      ]),
    )

    renderPage()

    expect(await screen.findByText('Action queue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create reminders' }))

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/reminders',
        expect.objectContaining({
          title: 'Career Ops: Cash Cafe · Server',
          list: 'Career Ops',
          priority: 1,
          notes: 'Apply today and call before 4 PM (Today)',
        }),
      )
    })
    expect(await screen.findByText('Created 1 follow-up reminders.')).toBeInTheDocument()
  })

  it('shows safe autofill helper after an approved batch executes', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'dossier-batch',
          company: 'Test Gym',
          role: 'Front Desk',
          location: 'Fort Myers, FL',
          lane: 'cash-now',
          stage: 'sourcing',
          source: {
            kind: 'live-search',
            label: 'Indeed',
            url: 'https://example.com/apply',
          },
          salaryText: '$18/hr',
          evaluation: {
            fitScore: 91,
            recommendation: 'pursue',
            reasonsToPursue: ['Fast local cash-now role'],
            reasonsToAvoid: [],
            riskFlags: [],
            confidenceGaps: [],
          },
        }),
      ]),
    )
    apiPost.mockImplementation((path: string) => {
      if (path.includes('/prepare-batch')) {
        return Promise.resolve({
          ok: true,
          data: {
            batchId: 'batch_1',
            applications: [
              {
                application: {
                  id: 'app_1',
                  dossierId: 'dossier-batch',
                  batchId: 'batch_1',
                  status: 'prepared',
                  submitMode: 'browser-assisted',
                  preparedAnswers: {
                    coverNote: 'Available flexible ASAP for $18/hr+.',
                    availability: 'Flexible ASAP',
                  },
                  packetSnapshot: {},
                  requiredFields: ['availability', 'resume'],
                  riskFlags: ['captcha'],
                  audit: [],
                  createdAt: '2026-05-12T12:00:00.000Z',
                  updatedAt: '2026-05-12T12:00:00.000Z',
                },
                dossier: {
                  id: 'dossier-batch',
                  company: 'Test Gym',
                  role: 'Front Desk',
                  location: 'Fort Myers, FL',
                  lane: 'cash-now',
                  stage: 'sourcing',
                  source: { label: 'Indeed' },
                  sourceUrl: 'https://example.com/apply',
                  score: 91,
                  recommendation: 'pursue',
                  nextAction: 'Apply today',
                  due: 'Today',
                  salaryText: '$18/hr',
                  estimatedHourlyRate: 18,
                  summary: 'Fast local cash-now role.',
                  tags: ['cash-now'],
                  notes: '',
                  evaluation: {
                    fitScore: 91,
                    recommendation: 'pursue',
                    reasonsToPursue: ['Fast local cash-now role'],
                    reasonsToAvoid: [],
                    riskFlags: [],
                    confidenceGaps: [],
                  },
                  assets: {},
                  timeline: [],
                  fingerprint: 'test-gym-front-desk',
                  createdAt: '2026-05-12T12:00:00.000Z',
                  updatedAt: '2026-05-12T12:00:00.000Z',
                },
              },
            ],
            approval: {
              id: 'clawctrl:appr_1',
              action: 'career.apply.batch',
              summary: 'Approve one safe browser-assisted application.',
              risk: 'high',
              status: 'pending',
              expiresAt: '2026-05-12T13:00:00.000Z',
              scope: {},
            },
          },
        })
      }
      if (path.includes('/execute-batch')) {
        return Promise.resolve({
          ok: true,
          data: {
            batchId: 'batch_1',
            status: 'queued_for_browser_submit',
            hardStops: ['captcha', 'ssn', 'payment'],
            applications: [],
            browserTasks: [
              {
                applicationId: 'app_1',
                dossierId: 'dossier-batch',
                company: 'Test Gym',
                role: 'Front Desk',
                url: 'https://example.com/apply',
                answers: { availability: 'Flexible ASAP' },
                requiredFields: ['availability'],
                hardStops: ['captcha', 'ssn', 'payment'],
                fillMode: 'safe-no-submit-helper',
                fillInstructions: 'Fills common non-sensitive fields and never submits.',
                fillScript: '(() => ({ submitted: false }))();',
              },
            ],
          },
        })
      }
      return Promise.resolve({ ok: true, data: {} })
    })

    const user = userEvent.setup()
    renderPage()

    await openCareerOpsView(user, 'Applications')
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare approved batch' }))
    expect(await screen.findByText('Approval summary')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Batch capability'), { target: { value: 'capability-token' } })
    const executeButton = screen.getByRole('button', { name: 'Execute approved batch' })
    await waitFor(() => {
      expect(executeButton).toBeEnabled()
    })
    fireEvent.click(executeButton)

    expect(await screen.findByText('Safe autofill helper')).toBeInTheDocument()
    expect(screen.getByLabelText('Autofill helper for Test Gym')).toHaveValue('(() => ({ submitted: false }))();')
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/api/career/applications/events',
        expect.objectContaining({
          applicationId: 'app_1',
          event: 'browser_open_blocked',
          url: 'https://example.com/apply',
        }),
      )
    })
  })

  it('shows packet gaps before preparing an application batch', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'engineering-gap',
          company: 'Gap Labs',
          role: 'Automation Intern',
          lane: 'engineering',
          stage: 'sourcing',
          evaluation: {
            fitScore: 82,
            recommendation: 'pursue',
            reasonsToPursue: ['Good career-track fit'],
            reasonsToAvoid: [],
            riskFlags: [],
            confidenceGaps: [],
          },
        }),
      ]),
    )
    apiPost.mockImplementation((path: string) => {
      if (path.includes('/prepare-batch')) {
        return Promise.resolve({
          ok: true,
          data: {
            batchId: 'batch_gap',
            applications: [],
            approval: {
              id: 'clawctrl:appr_gap',
              action: 'career.apply.batch',
              summary: 'Approve one application with packet gaps.',
              risk: 'high',
              status: 'pending',
              expiresAt: '2026-05-12T13:00:00.000Z',
              scope: {},
            },
          },
        })
      }
      return Promise.resolve({ ok: true, data: {} })
    })

    const user = userEvent.setup()
    renderPage()

    await openCareerOpsView(user, 'Applications')

    expect(await screen.findByLabelText('Batch packet checklist')).toBeInTheDocument()
    expect(screen.getByText('Proof bullets')).toBeInTheDocument()
    expect(screen.getByText('0 work/project proof items')).toBeInTheDocument()
    expect(screen.getByText('Links')).toBeInTheDocument()
    expect(screen.getByText('0 saved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare approved batch' }))

    expect(await screen.findByText(/Batch prepared with packet gaps: Proof bullets, Links/)).toBeInTheDocument()
  })

  it('loads saved application history from the backend', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'history-dossier',
          company: 'History Gym',
          role: 'Front Desk Associate',
          lane: 'cash-now',
        }),
      ]),
    )
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/career/applications')) {
        return Promise.resolve({
          ok: true,
          data: {
            applications: [
              {
                id: 'history-app',
                dossierId: 'history-dossier',
                batchId: 'batch_history',
                status: 'executed',
                submitMode: 'browser-assisted',
                preparedAnswers: {},
                packetSnapshot: {},
                requiredFields: [],
                riskFlags: [],
                audit: [],
                createdAt: '2026-05-12T12:00:00.000Z',
                updatedAt: '2026-05-12T12:15:00.000Z',
              },
            ],
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    const user = userEvent.setup()
    renderPage()

    await openCareerOpsView(user, 'Applications')

    const history = await screen.findByLabelText('Application history')
    expect(within(history).getByText('History Gym · Front Desk Associate')).toBeInTheDocument()
    expect(within(history).getByText('executed')).toBeInTheDocument()
    expect(within(history).getByText('batch_history')).toBeInTheDocument()
  })

  it('loads outcome history and query-aware learning stats from the backend', async () => {
    localStorage.setItem(
      'career-ops-dossiers',
      JSON.stringify([
        makeStoredDossier({
          id: 'outcome-dossier',
          company: 'Callback Cafe',
          role: 'Server',
          lane: 'cash-now',
          source: {
            kind: 'live-search',
            label: 'Indeed',
            url: 'https://example.com/server',
          },
        }),
      ]),
    )
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/career/outcomes')) {
        return Promise.resolve({
          ok: true,
          data: {
            outcomes: [
              {
                id: 'outcome-1',
                dossierId: 'outcome-dossier',
                applicationId: null,
                outcome: 'callback',
                callbackQuality: 'good',
                pay: '$18/hr',
                lesson: 'Server roles with evening availability are getting callbacks.',
                metadata: {
                  lane: 'cash-now',
                  source: 'Indeed',
                  query: 'server part time Fort Myers',
                },
                createdAt: '2026-05-12T12:30:00.000Z',
                updatedAt: '2026-05-12T12:30:00.000Z',
              },
            ],
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    renderPage()

    const history = await screen.findByLabelText('Outcome history')
    await waitFor(() => {
      expect(within(history).getByText('Callback Cafe · Server')).toBeInTheDocument()
      expect(within(history).getByText('callback')).toBeInTheDocument()
      expect(screen.getByText('1 callbacks')).toBeInTheDocument()
      expect(screen.getByText('Query: server part time Fort Myers')).toBeInTheDocument()
      expect(screen.getAllByText(/Server roles with evening availability/).length).toBeGreaterThan(0)
    })
  })

  it('re-ranks saved searches using outcome learning signals', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/career/outcomes')) {
        return Promise.resolve({
          ok: true,
          data: {
            outcomes: [
              {
                id: 'outcome-career-callback',
                dossierId: null,
                applicationId: null,
                outcome: 'callback',
                callbackQuality: 'good',
                pay: '$22/hr',
                lesson: 'Career-track AI/IT search is producing callbacks.',
                metadata: {
                  lane: 'engineering',
                  source: 'LinkedIn',
                  query: 'AI automation IT support data annotation entry level',
                },
                createdAt: '2026-05-12T12:30:00.000Z',
                updatedAt: '2026-05-12T12:30:00.000Z',
              },
            ],
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    renderPage()

    const learnedSearches = await screen.findByLabelText('Learned saved searches')
    await waitFor(() => {
      expect(within(learnedSearches).getByText(/Learning \+8/)).toBeInTheDocument()
    })
    const applyButtons = within(learnedSearches)
      .getAllByRole('button')
      .filter(button => !button.getAttribute('aria-label'))
    expect(applyButtons[0]).toHaveTextContent('Career Track: entry AI/IT')
  })

  it('loads search run history from the backend', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.includes('/api/career/search/runs')) {
        return Promise.resolve({
          ok: true,
          data: {
            searchRuns: [
              {
                id: 'run-history-1',
                lane: 'cash-now',
                query: 'part time Fort Myers $18',
                sourceSet: ['remotive', 'browser'],
                filters: { source: 'public-feeds-plus-browser-links' },
                resultCount: 7,
                dedupeFingerprints: ['fp-1', 'fp-2'],
                createdDossierIds: ['dos-1'],
                createdAt: '2026-05-13T12:00:00.000Z',
                updatedAt: '2026-05-13T12:00:00.000Z',
              },
            ],
          },
        })
      }
      return Promise.resolve({ ok: true, data: null })
    })

    renderPage()

    const history = await screen.findByLabelText('Search run history')
    await waitFor(() => {
      expect(within(history).getByText('part time Fort Myers $18')).toBeInTheDocument()
      expect(within(history).getByText('7 results')).toBeInTheDocument()
      expect(within(history).getByText('1 tracked')).toBeInTheDocument()
      expect(within(history).getByText('2 deduped')).toBeInTheDocument()
      expect(within(history).getByText(/remotive, browser/)).toBeInTheDocument()
    })
  })
})
