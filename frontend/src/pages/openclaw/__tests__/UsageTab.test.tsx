import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseOpenClawUsage = vi.fn()

vi.mock('@/hooks/useOpenClawUsage', () => ({
  useOpenClawUsage: () => mockUseOpenClawUsage(),
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
    mockUseOpenClawUsage.mockReturnValue({
      usage: {
        total_tokens: 150000,
        total_cost: 2.5,
        period: '2026-03',
        models: [{ model: 'claude-sonnet-4-6', tokens: 100000, cost: 1.5, requests: 50 }],
      },
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('Total Cost')).toBeInTheDocument()
    expect(screen.getByText('150,000')).toBeInTheDocument()
    expect(screen.getByText('$2.50')).toBeInTheDocument()
    expect(screen.getByText('2026-03')).toBeInTheDocument()
  })

  it('shows "OpenClaw is not configured" when healthy is false', () => {
    renderWithQC(<UsageTab healthy={false} />)

    expect(screen.getByText('OpenClaw is not configured.')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseOpenClawUsage.mockReturnValue({
      usage: undefined,
      loading: true,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows "No usage data available" when usage is null', () => {
    mockUseOpenClawUsage.mockReturnValue({
      usage: null,
      loading: false,
      error: null,
    })

    renderWithQC(<UsageTab healthy={true} />)

    expect(screen.getByText('No usage data available')).toBeInTheDocument()
  })

  it('renders model breakdown table when models present', () => {
    mockUseOpenClawUsage.mockReturnValue({
      usage: {
        total_tokens: 200000,
        total_cost: 3.0,
        models: [
          { model: 'claude-sonnet-4-6', tokens: 150000, cost: 2.0, requests: 75 },
          { model: 'gpt-4', tokens: 50000, cost: 1.0, requests: 25 },
        ],
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
    mockUseOpenClawUsage.mockReturnValue({
      usage: { total_tokens: undefined, total_cost: undefined },
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
})
