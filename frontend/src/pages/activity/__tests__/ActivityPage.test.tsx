import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn()

vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  API_BASE: 'http://127.0.0.1:3000',
}))

vi.mock('@/lib/hooks/useRealtimeSSE', () => ({
  useRealtimeSSE: vi.fn(),
  useTableRealtime: vi.fn(),
}))

vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ defaultTitle }: { defaultTitle: string }) => (
    <h1>{defaultTitle}</h1>
  ),
}))

vi.mock('@/components/Skeleton', () => ({
  SkeletonRows: () => <div data-testid="skeleton">Loading...</div>,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/activity']}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

// Lazy import after mocks are set up
async function getActivityPage() {
  const mod = await import('../ActivityPage')
  return mod.default
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Activity heading', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: { events: [] },
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('shows loading skeleton while fetching', async () => {
    // Never resolves -- stays loading
    mockGet.mockReturnValue(new Promise(() => {}))

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders event descriptions from API response', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: {
        events: [
          {
            id: 'e1',
            type: 'session.start',
            description: 'Session started',
            timestamp: '2026-03-24T12:00:00Z',
            agent: 'main',
          },
          {
            id: 'e2',
            type: 'cron.run',
            description: 'Backup cron executed',
            timestamp: '2026-03-24T11:30:00Z',
          },
          {
            id: 'e3',
            type: 'error',
            message: 'Agent crashed',
            timestamp: '2026-03-24T11:00:00Z',
            session_id: 'sess-abc',
          },
        ],
      },
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Session started')).toBeInTheDocument()
    })

    expect(screen.getByText('Backup cron executed')).toBeInTheDocument()
    expect(screen.getByText('Agent crashed')).toBeInTheDocument()
  })

  it('renders event type pills', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: {
        events: [
          { id: 'e1', type: 'session.start', description: 'Started', timestamp: '2026-03-24T12:00:00Z' },
          { id: 'e2', type: 'cron.run', description: 'Ran backup', timestamp: '2026-03-24T11:30:00Z' },
          { id: 'e3', type: 'error', message: 'Crashed', timestamp: '2026-03-24T11:00:00Z' },
        ],
      },
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('session.start')).toBeInTheDocument()
    })

    expect(screen.getByText('cron.run')).toBeInTheDocument()
    expect(screen.getByText('error')).toBeInTheDocument()
  })

  it('shows "No recent activity" for empty events', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: { events: [] },
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })
  })

  it('shows error state when fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Unable to load activity')).toBeInTheDocument()
    })
  })

  it('shows agent and session metadata', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: {
        events: [
          {
            id: 'e1',
            type: 'session.start',
            description: 'Session started',
            timestamp: '2026-03-24T12:00:00Z',
            agent: 'main',
            session_id: 'sess-123',
          },
        ],
      },
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('agent: main')).toBeInTheDocument()
    })
    expect(screen.getByText('session: sess-123')).toBeInTheDocument()
  })

  it('handles flat array response shape', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      data: [
        { id: 'e1', type: 'agent.start', description: 'Agent started', timestamp: '2026-03-24T12:00:00Z' },
      ],
    })

    const ActivityPage = await getActivityPage()
    render(<ActivityPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Agent started')).toBeInTheDocument()
    })
  })
})
