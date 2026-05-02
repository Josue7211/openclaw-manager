import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import JobHunterPage from '@/pages/JobHunter'
import type { LiveJob } from '@/pages/job-hunter-types'
import { recommendApplication, shouldAutoQueueBrowserReview } from '@/pages/job-hunter-domain'

const apiGet = vi.fn()

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
    apiGet.mockResolvedValue({
      query: '',
      count: 0,
      jobs: [],
    })
  })

  it('shows Career Ops branding and renders the opportunity queue from dossiers', async () => {
    localStorage.setItem('career-ops-dossiers', JSON.stringify([
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
    ]))

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

  it('creates a dossier from manual pasted intake text', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.clear(screen.getByLabelText('Pay floor'))
    await user.type(screen.getByLabelText('Pay floor'), '30')
    await user.clear(screen.getByLabelText('Core strengths'))
    await user.type(screen.getByLabelText('Core strengths'), 'workflow automation')

    await user.type(screen.getByLabelText('Company'), 'Beta Corp')
    await user.type(screen.getByLabelText('Role'), 'IT Support Specialist')
    await user.clear(screen.getByLabelText('Location'))
    await user.type(screen.getByLabelText('Location'), 'Fort Myers, FL')
    await user.type(
      screen.getByLabelText('Pasted description'),
      'Entry-level support role with ticketing, device setup, and onsite troubleshooting.',
    )
    await user.click(screen.getByRole('button', { name: 'Create dossier' }))

    expect(await screen.findByText('IT Support Specialist')).toBeInTheDocument()
    expect(screen.getAllByText(/Beta Corp/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Score opportunity and tailor assets/).length).toBeGreaterThan(0)

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('career-ops-dossiers') ?? '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        company: 'Beta Corp',
        role: 'IT Support Specialist',
        source: {
          kind: 'manual',
        },
      })
      expect(stored[0].notes).toContain('Entry-level support role')
      expect(stored[0].evaluation.confidenceGaps).toContain('Compensation not listed')
      expect(stored[0].assets.resumeBullets[0]).toContain('workflow automation')
      expect(stored[0].assets.coverNote).toContain('Beta Corp')
    })
  })

  it('lets the user update pay floor strategy and persists the profile', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.clear(screen.getByLabelText('Pay floor'))
    await user.type(screen.getByLabelText('Pay floor'), '30')

    expect(screen.getByLabelText('Pay floor')).toHaveValue(30)

    await waitFor(() => {
      const storedProfile = JSON.parse(localStorage.getItem('career-ops-profile') ?? '{}')
      expect(storedProfile.payFloor).toBe(30)
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

  it('moves an existing dossier to applied when the live job is marked applied', async () => {
    const user = userEvent.setup()

    apiGet.mockResolvedValue({
      query: 'it support remote',
      count: 1,
      jobs: [eligibleEntryLevelJob],
    })

    localStorage.setItem('career-ops-dossiers', JSON.stringify([
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
    ]))

    renderPage()

    expect(await screen.findByText('IT Support Specialist')).toBeInTheDocument()
    const openButton = await screen.findByRole('button', { name: 'Open' })
    const liveJobCard = openButton.closest('article')

    expect(liveJobCard).not.toBeNull()

    await user.click(within(liveJobCard as HTMLElement).getByRole('button', { name: 'Applied' }))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('career-ops-dossiers') ?? '[]')
      expect(stored[0]).toMatchObject({
        id: 'job-1-dossier',
        stage: 'applied',
      })
    })
  })

  it('migrates legacy tracked leads into dossiers and persists them', async () => {
    localStorage.setItem('job-hunter-tracked-leads', JSON.stringify([
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
    ]))

    renderPage()

    expect(await screen.findByText('QA Support Specialist')).toBeInTheDocument()
    expect(screen.getAllByText(/Legacy Labs/).length).toBeGreaterThan(0)

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('career-ops-dossiers') ?? '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        id: 'legacy-1',
        company: 'Legacy Labs',
        role: 'QA Support Specialist',
        stage: 'applied',
      })
    })
  })

  it('extracts a specific location from the pasted description and replaces the default location', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByLabelText('Location')).toHaveValue('Remote - US')

    await user.type(screen.getByLabelText('Pasted description'), 'Role: Support Specialist. Location: Austin, TX. Handle ticketing and onsite device setup.')
    await user.click(screen.getByRole('button', { name: 'Extract from description' }))

    expect(screen.getByLabelText('Location')).toHaveValue('Austin, TX')
  })

  it('removes the no-op priority control from intake', async () => {
    renderPage()

    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument()
  })

  it('updates the detail panel when a different dossier is selected from the queue', async () => {
    const user = userEvent.setup()

    localStorage.setItem('career-ops-dossiers', JSON.stringify([
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
    ]))

    renderPage()

    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Automation detail summary.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /select support specialist at beacon health/i }))

    expect(screen.getByText('Beacon Health')).toBeInTheDocument()
    expect(screen.getByText('Support detail summary.')).toBeInTheDocument()
    expect(screen.getByText('Onsite rotation unclear')).toBeInTheDocument()
  })

  it('resets dossier detail to the visible filtered queue when the current selection is filtered out', async () => {
    const user = userEvent.setup()

    localStorage.setItem('career-ops-dossiers', JSON.stringify([
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
    ]))

    renderPage()

    expect(await screen.findByText('Applied Labs')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /select offer engineer at offer works/i }))
    expect(screen.getByText('Offer summary.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Applied' }))

    await waitFor(() => {
      expect(screen.getByText('Applied summary.')).toBeInTheDocument()
      expect(screen.queryByText('Offer summary.')).not.toBeInTheDocument()
    })
  })

  it('keeps skipped opportunities out of the action queue', async () => {
    localStorage.setItem('career-ops-dossiers', JSON.stringify([
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
    ]))

    renderPage()

    expect(await screen.findByText('Action queue')).toBeInTheDocument()
    expect(screen.getByText('Send tailored application (Today)')).toBeInTheDocument()
    expect(screen.queryByText('Do not surface this action (Today)')).not.toBeInTheDocument()
    expect(screen.getByText('Generic Operator')).toBeInTheDocument()
  })
})
