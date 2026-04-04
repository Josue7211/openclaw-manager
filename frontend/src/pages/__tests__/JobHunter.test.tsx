import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

import JobHunterPage from '../JobHunter'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JobHunterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('JobHunterPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      query: '',
      count: 6,
      jobs: Array.from({ length: 6 }, (_, index) => ({
        id: `remotive-${index + 1}`,
        source: 'Remotive',
        sourceId: String(index + 1),
        title: index === 0 ? 'Senior Frontend Engineer' : `AI Automation Engineer ${index + 1}`,
        company: index === 0 ? 'Northwind' : `Company ${index + 1}`,
        category: 'Software Development',
        jobType: 'full_time',
        location: 'Remote - US',
        salary: '$180k - $220k',
        publishedAt: '2026-04-01T12:00:00Z',
        url: `https://example.com/job-${index + 1}`,
        summary: 'Build product surfaces for a high-growth team.',
      })),
    })
  })

  it('loads live jobs from the backend and lets the user track one', async () => {
    renderPage()

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/jobs/search?q=AI+automation+entry+level+intern+remote&limit=24&sources=remotive%2Cremoteok%2Carbeitnow&smart_filter=true&max_age_days=21')
    })

    expect(screen.getByText('Fast lane: top jobs first, fewer distractions, browser review ready.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show more jobs' })).toBeInTheDocument()
    }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Employed mode/ }))

    expect(screen.getByText('Browse lane: more jobs, broader comparison, less aggressive filtering.')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Track' }).length).toBeGreaterThan(0)
    }, { timeout: 3000 })
    const trackButtons = screen.getAllByRole('button', { name: 'Track' })
    fireEvent.click(trackButtons[0])

    expect(await screen.findByRole('button', { name: 'Pinged' })).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem('job-hunter-tracked-leads') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].role).toBeDefined()
  })
})
