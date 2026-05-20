import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GrowthOpsPage from '@/pages/GrowthOps'
import type { GrowthOpsState, PostPackage } from '@/pages/growth-ops-types'
import {
  GROWTH_OPS_LOCAL_STORAGE_KEY,
  GROWTH_OPS_MIGRATED_KEY,
  GROWTH_OPS_STORAGE_KEY,
  defaultGrowthOpsState,
  generateDailyContentIdeas,
  updateRecipeLearning,
  validatePostPackage,
  previewAnalyticsImport,
  commitAnalyticsImport,
} from '@/pages/growth-ops-domain'

const apiGet = vi.fn()
const apiPost = vi.fn()
const apiPut = vi.fn()
const apiPatch = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    put: (...args: unknown[]) => apiPut(...args),
    patch: (...args: unknown[]) => apiPatch(...args),
  },
}))

function envelope(data: unknown) {
  return { ok: true, data }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <GrowthOpsPage />
    </MemoryRouter>,
  )
}

describe('GrowthOpsPage', () => {
  let serverState: GrowthOpsState
  let serverRuns: unknown[]

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    serverState = defaultGrowthOpsState()
    serverRuns = []
    apiGet.mockImplementation((path: string) => {
      if (path === '/api/growth/connectors/status') {
        return Promise.resolve(
          envelope({
            connectors: [
              { id: 'u:tiktok', platform: 'tiktok', status: 'not_configured', permissions: [], reason: 'Missing secret service social.tiktok.' },
              { id: 'u:instagram', platform: 'instagram', status: 'not_configured', permissions: [], reason: 'Missing secret service social.instagram.' },
              { id: 'u:youtube', platform: 'youtube', status: 'not_configured', permissions: [], reason: 'Missing secret service social.youtube.' },
            ],
          }),
        )
      }
      if (path === '/api/growth/runs') return Promise.resolve(envelope({ runs: serverRuns }))
      return Promise.resolve(envelope(serverState))
    })
    apiPut.mockImplementation((_path: string, body: GrowthOpsState) => {
      serverState = body
      return Promise.resolve(envelope(serverState))
    })
    apiPost.mockImplementation((path: string, body?: unknown) => {
      if (path === '/api/growth/ideas/generate') {
        serverState = { ...serverState, contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')) }
        return Promise.resolve(envelope({ ideas: serverState.contentIdeas }))
      }
      if (path === '/api/growth/viral-videos') {
        serverState = {
          ...serverState,
          viralVideos: [
            {
              id: 'viral-api-1',
              capturedAt: '2026-05-14T12:00:00.000Z',
              source: 'manual-link',
              ...(body as Record<string, unknown>),
            } as GrowthOpsState['viralVideos'][number],
            ...serverState.viralVideos,
          ],
        }
        return Promise.resolve(envelope(serverState))
      }
      if (path === '/api/growth/analytics/import/preview') {
        const rows = (body as { rows?: Array<Record<string, string>> })?.rows ?? []
        return Promise.resolve(envelope({ preview: previewAnalyticsImport(serverState, rows) }))
      }
      if (path === '/api/growth/analytics/import/commit') {
        const previewRows = (body as { previewRows?: ReturnType<typeof previewAnalyticsImport> })?.previewRows ?? []
        serverState = commitAnalyticsImport(serverState, previewRows)
        const run = {
          id: 'run-import-1',
          run_type: 'growth.analytics.import.manual',
          status: 'completed',
          started_at: '2026-05-14T12:00:00.000Z',
          completed_at: '2026-05-14T12:00:00.000Z',
          source_counts: { previewRows: previewRows.length },
          created_record_counts: {
            growth_post_metric_snapshots: serverState.metricSnapshots.length,
            growth_quarantined_analytics_rows: serverState.quarantinedAnalyticsRows.length,
          },
          updated_record_counts: { growth_content_recipes: serverState.contentRecipes.length },
          connector_statuses: [],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run, state: serverState }))
      }
      if (path === '/api/growth/post-packages') {
        const postPackage = body as PostPackage
        serverState = {
          ...serverState,
          postPackages: [postPackage, ...serverState.postPackages.filter(item => item.id !== postPackage.id)],
        }
        return Promise.resolve(envelope(serverState))
      }
      if (path.endsWith('/approve')) {
        const parts = path.split('/')
        const id = parts[parts.length - 2]
        const approved = serverState.postPackages.find(item => item.id === id)
        return Promise.resolve(envelope(approved ? { ...approved, approvalState: 'queued', validationErrors: [] } : null))
      }
      if (path === '/api/growth/runs/watchlist-refresh') {
        const run = {
          id: 'run-watchlist-1',
          run_type: 'growth.watchlist.refresh.daily',
          status: 'blocked',
          started_at: '2026-05-14T12:00:00.000Z',
          blocked_reason: 'Official provider missing; manual-ready.',
          connector_statuses: [
            { id: 'u:tiktok', platform: 'tiktok', status: 'not_configured', permissions: [], reason: 'Missing secret service social.tiktok.' },
          ],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run }))
      }
      if (path === '/api/growth/runs/calendar-planning') {
        serverState = {
          ...serverState,
          contentIdeas: (serverState.contentIdeas.length > 0
            ? serverState.contentIdeas
            : generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z'))
          ).map((idea, index) => ({
            ...idea,
            status: index < 3 ? 'scripted' : idea.status,
            makeToday: index < 3 ? true : idea.makeToday,
            plannedSlots: [
              {
                id: `slot-${index}`,
                date: '2026-05-14',
                platform: index % 3 === 1 ? 'instagram' : index % 3 === 2 ? 'youtube' : 'tiktok',
                state: index < 3 ? 'scripted' : 'idea',
                ideaId: idea.id,
                title: idea.title,
                batchRecording: false,
                order: index,
              },
            ],
          })),
        }
        const run = {
          id: 'run-calendar-1',
          run_type: 'growth.calendar.plan.daily',
          status: 'completed',
          started_at: '2026-05-14T12:00:00.000Z',
          completed_at: '2026-05-14T12:00:00.000Z',
          source_counts: { ideas: serverState.contentIdeas.length },
          created_record_counts: {},
          updated_record_counts: { growth_content_ideas: serverState.contentIdeas.length },
          connector_statuses: [],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run, state: serverState }))
      }
      if (path === '/api/growth/runs/owned-analytics') {
        const queued = serverState.postPackages.filter(item => item.approvalState === 'queued')
        serverState = updateRecipeLearning({
          ...serverState,
          metricSnapshots: queued.flatMap(postPackage => {
            const idea = serverState.contentIdeas.find(item => item.id === postPackage.ideaId)
            return (['tiktok', 'instagram', 'youtube'] as const)
              .filter(platform => postPackage.platformVariants[platform]?.enabled)
              .map((platform, index) => ({
                id: `metric-${postPackage.id}-${platform}`,
                postPackageId: postPackage.id,
                ideaId: postPackage.ideaId,
                recipeId: idea?.recipeId,
                platform,
                measuredAt: '2026-05-14T12:00:00.000Z',
                horizon: '24h' as const,
                metrics: {
                  views: 5000 + index * 500,
                  likes: 650,
                  comments: 90,
                  shares: 180,
                  saves: 240,
                  watchRetention: 78,
                  followerDelta: 45,
                  leadSignal: 2,
                },
              }))
          }),
        })
        const run = {
          id: 'run-analytics-1',
          run_type: 'growth.analytics.owned.daily',
          status: 'completed',
          started_at: '2026-05-14T12:00:00.000Z',
          completed_at: '2026-05-14T12:00:00.000Z',
          source_counts: { queuedPackages: queued.length },
          created_record_counts: { growth_post_metric_snapshots: serverState.metricSnapshots.length },
          updated_record_counts: { growth_content_recipes: serverState.contentRecipes.length },
          connector_statuses: [],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run, state: serverState }))
      }
      if (path === '/api/growth/runs/recipe-scoring') {
        serverState = updateRecipeLearning(serverState)
        const run = {
          id: 'run-recipe-scoring-1',
          run_type: 'growth.recipes.score.manual',
          status: 'completed',
          started_at: '2026-05-14T12:00:00.000Z',
          completed_at: '2026-05-14T12:00:00.000Z',
          source_counts: { snapshots: serverState.metricSnapshots.length, videos: serverState.viralVideos.length },
          created_record_counts: {},
          updated_record_counts: { growth_content_recipes: serverState.contentRecipes.length },
          connector_statuses: [],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run, state: serverState }))
      }
      if (path === '/api/growth/runs/recommendation-refresh') {
        serverState = updateRecipeLearning(serverState)
        const run = {
          id: 'run-recommendation-refresh-1',
          run_type: 'growth.recommendations.refresh.manual',
          status: 'completed',
          started_at: '2026-05-14T12:00:00.000Z',
          completed_at: '2026-05-14T12:00:00.000Z',
          source_counts: { recipes: serverState.contentRecipes.length },
          created_record_counts: {},
          updated_record_counts: { growth_content_recipes: serverState.contentRecipes.length },
          connector_statuses: [],
        }
        serverRuns = [run, ...serverRuns]
        return Promise.resolve(envelope({ run, state: serverState }))
      }
      return Promise.resolve(envelope({}))
    })
    apiPatch.mockImplementation((_path: string, patch: Partial<PostPackage> & { id: string }) => {
      serverState = {
        ...serverState,
        postPackages: serverState.postPackages.map(item =>
          item.id === patch.id ? validatePostPackage({ ...item, ...patch }) : item,
        ),
      }
      return Promise.resolve(envelope(serverState))
    })
  })

  it('renders standalone Growth Ops and generates ten ideas with three make-today picks', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Growth Ops')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Generate ideas/i }))

    expect(await screen.findAllByText('make today')).toHaveLength(3)
    expect(screen.getAllByText(/squat depth myth/i).length).toBeGreaterThan(0)
    await waitFor(() => expect(serverState.contentIdeas).toHaveLength(10))
  })

  it('renders the weekly calendar from API state and derives today shoot list from scripted ideas', async () => {
    const today = new Date().toISOString().slice(0, 10)
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date()).map((idea, index) => ({
        ...idea,
        status: index === 0 ? 'scripted' : idea.status,
        makeToday: index === 0,
        plannedSlots:
          index === 0
            ? [
                {
                  id: 'slot-test-tiktok',
                  date: today,
                  platform: 'tiktok',
                  state: 'scripted',
                  ideaId: idea.id,
                  title: idea.title,
                  batchRecording: false,
                  order: 0,
                },
              ]
            : [],
      })),
    }

    renderPage()

    expect(await screen.findByText('Weekly content calendar')).toBeInTheDocument()
    expect(screen.getByText("Today's shoot list")).toBeInTheDocument()
    expect(screen.getAllByText(/scripted/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/TikTok/i).length).toBeGreaterThan(0)
  })

  it('packages an idea, attaches a video, and queues through approval', async () => {
    const user = userEvent.setup()
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')),
    }
    renderPage()

    await user.click((await screen.findAllByRole('button', { name: /Package/i }))[0])
    await waitFor(() => expect(serverState.postPackages).toHaveLength(1))

    expect(String((screen.getByLabelText('Script draft') as HTMLTextAreaElement).value)).toContain('Show the wrong rep')
    fireEvent.change(screen.getByLabelText('Cover title variants'), { target: { value: 'Squat depth truth\nFix this cue' } })
    await user.type(screen.getByPlaceholderText('Video file path'), '/tmp/squat-depth.mp4')
    await user.type(screen.getByPlaceholderText('Cover image path'), '/tmp/squat-cover.jpg')
    await user.click(screen.getByRole('button', { name: /Save edits/i }))
    await waitFor(() => expect(serverState.postPackages[0].approvalState).toBe('ready-for-approval'))
    expect(serverState.postPackages[0].coverTitleVariants).toEqual(['Squat depth truth', 'Fix this cue'])
    expect(serverState.postPackages[0].shotList.length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Approve/i }))
    expect((await screen.findAllByText('queued')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument()
  }, 30000)

  it('falls back to local V1 state when the backend load fails', async () => {
    const local = {
      ...defaultGrowthOpsState(),
      contentIdeas: generateDailyContentIdeas(defaultGrowthOpsState(), new Date('2026-05-14T12:00:00.000Z')),
    }
    localStorage.setItem(GROWTH_OPS_STORAGE_KEY, JSON.stringify(local))
    apiGet.mockImplementation((path: string) => {
      if (path === '/api/growth/state') return Promise.reject(new Error('offline'))
      if (path === '/api/growth/connectors/status') return Promise.resolve(envelope({ connectors: [] }))
      if (path === '/api/growth/runs') return Promise.resolve(envelope({ runs: [] }))
      return Promise.resolve(envelope({}))
    })

    renderPage()

    expect((await screen.findAllByText(/squat depth myth/i)).length).toBeGreaterThan(0)
    expect(await screen.findByText(/pending local upload/i)).toBeInTheDocument()
    expect(localStorage.getItem('growth-ops-v2_5-pending-upload')).toBe('1')
  })

  it('clears the offline pending upload indicator after a successful server load', async () => {
    localStorage.setItem('growth-ops-v2_5-pending-upload', '1')
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')).slice(0, 1),
    }

    renderPage()

    expect(await screen.findByText('synced')).toBeInTheDocument()
    expect(screen.queryByText(/pending local upload/i)).not.toBeInTheDocument()
    expect(localStorage.getItem('growth-ops-v2_5-pending-upload')).toBeNull()
  })

  it('uploads normalized local migration only when the server is empty', async () => {
    const local = {
      ...defaultGrowthOpsState(),
      viralVideos: [
        {
          id: 'viral-local',
          platform: 'tiktok',
          creatorHandle: 'science_lifter',
          url: 'https://tiktok.example/video/1',
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
    localStorage.setItem(GROWTH_OPS_STORAGE_KEY, JSON.stringify(local))
    serverState = { ...defaultGrowthOpsState(), creatorWatchlist: [], contentRecipes: [] }

    renderPage()

    await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/api/growth/state', expect.objectContaining({ viralVideos: expect.any(Array) })))
    expect(localStorage.getItem(GROWTH_OPS_MIGRATED_KEY)).toBeTruthy()
    expect(localStorage.getItem(GROWTH_OPS_LOCAL_STORAGE_KEY)).toBeTruthy()
  })

  it('captures a viral video through the API and shows connector missing-secret diagnostics', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Connector readiness')).toBeInTheDocument()
    expect(screen.getAllByText(/social\.tiktok/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/not configured/i).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('video.list')).toBeInTheDocument()
    expect(screen.getByText('youtube.readonly')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Video URL'), 'https://tiktok.example/v/2?utm_source=x')
    await user.type(screen.getByPlaceholderText('Opening hook'), 'This cue made squats finally click')
    await user.click(screen.getByRole('button', { name: /Save video/i }))

    await waitFor(() => expect(serverState.viralVideos).toHaveLength(1))
    expect(apiPost).toHaveBeenCalledWith('/api/growth/viral-videos', expect.objectContaining({ hook: expect.stringContaining('squats') }))
  })

  it('logs run history with connector snapshots from run endpoints', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Watchlist refresh/i }))

    expect(await screen.findByText('growth.watchlist.refresh.daily')).toBeInTheDocument()
    expect(screen.getByText(/manual-ready/i)).toBeInTheDocument()
    expect(screen.getByText(/TikTok not configured/i)).toBeInTheDocument()
  })

  it('logs calendar planning and owned analytics recommendation updates', async () => {
    const user = userEvent.setup()
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')),
    }
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Calendar plan/i }))
    expect(await screen.findByText('growth.calendar.plan.daily')).toBeInTheDocument()
    expect(serverState.contentIdeas[0].plannedSlots).toHaveLength(1)

    await user.click((await screen.findAllByRole('button', { name: /Package/i }))[0])
    await user.type(await screen.findByPlaceholderText('Video file path'), '/tmp/analytics.mp4')
    await user.click(screen.getByRole('button', { name: /Save edits/i }))
    await waitFor(() => expect(serverState.postPackages[0].approvalState).toBe('ready-for-approval'))
    await user.click(screen.getByRole('button', { name: /Approve/i }))
    await waitFor(() => expect(serverState.postPackages[0].approvalState).toBe('queued'))

    await user.click(screen.getByRole('button', { name: /Owned analytics/i }))

    await waitFor(() => expect(serverState.metricSnapshots.length).toBeGreaterThan(0))
    expect(serverState.contentRecipes.some(recipe => recipe.recommendation !== 'test')).toBe(true)
    expect(await screen.findByText('growth.analytics.owned.daily')).toBeInTheDocument()
  }, 30000)

  it('logs manual recipe scoring and recommendation refresh runs', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Score recipes/i }))
    expect(await screen.findByText('growth.recipes.score.manual')).toBeInTheDocument()
    expect(apiPost).toHaveBeenCalledWith('/api/growth/runs/recipe-scoring', {})

    await user.click(screen.getByRole('button', { name: /Refresh recommendations/i }))
    expect(await screen.findByText('growth.recommendations.refresh.manual')).toBeInTheDocument()
    expect(apiPost).toHaveBeenCalledWith('/api/growth/runs/recommendation-refresh', {})
  })

  it('previews and commits manual analytics import with quarantine rows', async () => {
    const user = userEvent.setup()
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')),
    }
    const postPackage = validatePostPackage({
      id: 'post-import',
      ideaId: serverState.contentIdeas[0].id,
      videoFile: '/tmp/import.mp4',
      scriptDraft: 'Hook\nDemo\nCTA',
      shotList: [{ id: 'shot', label: 'Hook shot', done: true }],
      brollChecklist: [{ id: 'broll', label: 'Cue closeup', done: false }],
      coverTitleVariants: ['Import proof'],
      platformVariants: {
        tiktok: { enabled: true, title: 'Import proof', caption: 'Cue', scheduledAt: '2026-05-15T12:00:00Z' },
        instagram: { enabled: false, title: '', caption: '', scheduledAt: '' },
        youtube: { enabled: false, title: '', caption: '', scheduledAt: '' },
      },
      approvalState: 'ready-for-approval',
      validationErrors: [],
      approvalAudit: [],
      createdAt: '2026-05-14T12:00:00.000Z',
    })
    serverState = { ...serverState, postPackages: [postPackage] }
    renderPage()

    const analyticsBox = await screen.findByLabelText('Analytics CSV import')
    fireEvent.change(analyticsBox, {
      target: {
        value: `platform,package,topic,horizon,views,likes,comments,shares,saves,confidence
tiktok,post-import,,24h,12000,1800,90,300,600,high
youtube,,,24h,50,1,0,0,0,low`,
      },
    })
    await user.click(screen.getByRole('button', { name: /Preview import/i }))
    expect(await screen.findByText(/Preview rows: 2/i)).toBeInTheDocument()
    expect(screen.getByText(content => content.includes('quarantine 1'))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Commit import/i }))

    await waitFor(() => expect(serverState.metricSnapshots).toHaveLength(1))
    expect(serverState.quarantinedAnalyticsRows).toHaveLength(1)
    expect(await screen.findByText('growth.analytics.import.manual')).toBeInTheDocument()
  }, 30000)

  it('persists calendar slot edits from the editable calendar', async () => {
    const user = userEvent.setup()
    serverState = {
      ...serverState,
      contentIdeas: generateDailyContentIdeas(serverState, new Date('2026-05-14T12:00:00.000Z')).slice(0, 2),
    }
    renderPage()

    const ideaSelect = (await screen.findAllByLabelText(/slot-.* idea/i))[0]
    await user.selectOptions(ideaSelect, serverState.contentIdeas[0].id)
    const statusSelect = screen.getAllByLabelText(/slot-.* status/i)[0]
    await user.selectOptions(statusSelect, 'needs-video')
    await user.click(screen.getAllByRole('button', { name: /Save slot/i })[0])

    await waitFor(() => expect(serverState.contentIdeas[0].plannedSlots).toHaveLength(1))
    expect(serverState.contentIdeas[0].plannedSlots[0].state).toBe('needs-video')
  }, 30000)
})
