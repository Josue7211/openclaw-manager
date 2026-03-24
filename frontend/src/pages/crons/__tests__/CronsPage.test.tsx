import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateMutation = { mutate: vi.fn(), mutateAsync: vi.fn() }
const mockUpdateMutation = { mutate: vi.fn(), mutateAsync: vi.fn() }
const mockDeleteMutation = { mutate: vi.fn(), mutateAsync: vi.fn() }

vi.mock('@/hooks/useCrons', () => ({
  useCrons: vi.fn(() => ({
    jobs: [],
    loading: false,
    createMutation: mockCreateMutation,
    updateMutation: mockUpdateMutation,
    deleteMutation: mockDeleteMutation,
    invalidateCrons: vi.fn(),
  })),
}))

vi.mock('@/lib/hooks/useEscapeKey', () => ({
  useEscapeKey: vi.fn(),
}))

vi.mock('@/lib/hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(() => ({ current: null })),
}))

vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: vi.fn(),
}))

import CronsPage from '../../CronJobs'
import { useCrons } from '@/hooks/useCrons'
import type { CronJob } from '../types'

const mockJob1: CronJob = {
  id: 'c1',
  name: 'Daily Backup',
  description: 'Nightly database backup',
  schedule: { kind: 'every', everyMs: 86400000 },
  state: { nextRunAtMs: 1711324800000, lastRunAtMs: 1711238400000, lastRunStatus: 'ok' },
  createdAtMs: 1711152000000,
  enabled: true,
}

const mockJob2: CronJob = {
  id: 'c2',
  name: 'Health Check',
  schedule: { kind: 'every', everyMs: 300000 },
  enabled: true,
}

function renderCronsPage(jobs: CronJob[] = []) {
  vi.mocked(useCrons).mockReturnValue({
    jobs,
    loading: false,
    createMutation: mockCreateMutation as any,
    updateMutation: mockUpdateMutation as any,
    deleteMutation: mockDeleteMutation as any,
    invalidateCrons: vi.fn(),
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CronsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without throwing', () => {
    expect(() => renderCronsPage()).not.toThrow()
  })

  it('displays the "Cron Calendar" header', () => {
    renderCronsPage()
    expect(screen.getByText('Cron Calendar')).toBeInTheDocument()
  })

  it('renders the "New Job" create button', () => {
    renderCronsPage()
    expect(screen.getByLabelText('Create new cron job')).toBeInTheDocument()
  })

  it('renders mock job names when jobs are provided', () => {
    renderCronsPage([mockJob1, mockJob2])
    // Job names appear multiple times (week grid + job list), so use getAllByText
    expect(screen.getAllByText('Daily Backup').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Health Check').length).toBeGreaterThan(0)
  })

  it('renders week navigation controls', () => {
    renderCronsPage()
    expect(screen.getByText('Prev')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('handles jobs with full gateway state fields without error', () => {
    const jobWithFullState: CronJob = {
      id: 'c3',
      name: 'Stateful Job',
      schedule: { kind: 'every', everyMs: 7200000 },
      state: {
        nextRunAtMs: 1711324800000,
        lastRunAtMs: 1711238400000,
        lastRunStatus: 'ok',
      },
      createdAtMs: 1711152000000,
      enabled: true,
    }
    expect(() => renderCronsPage([jobWithFullState])).not.toThrow()
    expect(screen.getAllByText('Stateful Job').length).toBeGreaterThan(0)
  })
})
