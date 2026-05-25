import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseHarnessUsage = vi.fn()

vi.mock('@/hooks/useHermesUsage', () => ({
  useHermesUsage: () => mockUseHarnessUsage(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import UsageTab from '../UsageTab'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithQC(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(createElement(QueryClientProvider, { client: qc }, ui))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsageTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without throwing when healthy with usage data', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: {
        total_tokens: 150000,
        total_cost: 2.5,
        models: [{ model: 'claude-sonnet-4-6', tokens: 100000, cost: 1.5, requests: 50 }],
      },
      usage: {
        totalTokens: 150000,
        totalCost: 2.5,
        used: 150000,
        period: '2026-03',
        accounts: [],
        windows: [],
      },
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('150k')).toBeInTheDocument()
    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('2026-03')).toBeInTheDocument()
  })

  it('shows "Hermes Agent not configured" when healthy is false', () => {
    renderWithQC(<UsageTab healthy={false} status="not_configured" />)

    expect(screen.getByText('Hermes Agent not configured')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: undefined,
      usage: undefined,
      loading: true,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows "No usage data available" when usage is null', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: null,
      usage: null,
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('No usage data available')).toBeInTheDocument()
  })

  it('renders model breakdown table when models present', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: {
        total_tokens: 200000,
        total_cost: 3.0,
        models: [
          { model: 'claude-sonnet-4-6', tokens: 150000, cost: 2.0, requests: 75 },
          { model: 'gpt-4', tokens: 50000, cost: 1.0, requests: 25 },
        ],
      },
      usage: {
        totalTokens: 200000,
        totalCost: 3.0,
        used: 200000,
        accounts: [],
        windows: [],
      },
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('Model Usage')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument()
    expect(screen.getByText('gpt-4')).toBeInTheDocument()
  })

  it('renders stat cards with fallback values for missing fields', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: { total_tokens: undefined, total_cost: undefined },
      usage: { accounts: [], windows: [] },
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    // Fallback values should be '--'
    const dashes = screen.getAllByText('--')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
    // Period falls back to "All time"
    expect(screen.getByText('All time')).toBeInTheDocument()
  })

  it('renders Hermes Agent account and limit breakdowns', () => {
    mockUseHarnessUsage.mockReturnValue({
      rawUsage: { total_tokens: 100000 },
      usage: {
        totalTokens: 100000,
        used: 40,
        remaining: 60,
        totalCost: 1,
        accounts: [{ id: 'personal', label: 'personal', used: 10, remaining: 90, percent: 10, windows: [] }],
        windows: [{ id: 'fiveHour', label: '5h', used: 40, limit: 100, remaining: 60, percent: 40 }],
      },
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('5h limit')).toBeInTheDocument()
    expect(screen.getByText('Hermes Agent Accounts')).toBeInTheDocument()
    expect(screen.getByText('personal')).toBeInTheDocument()
  })
})
