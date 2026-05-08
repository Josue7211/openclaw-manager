import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the harness status hook to isolate component rendering from API calls
vi.mock('@/hooks/useHarnessStatus', () => ({
  useHarnessStatus: vi.fn(() => ({
    status: 'connected' as const,
    connected: true,
    isLoading: false,
    providerLabel: 'Harness',
  })),
}))

import { GatewayStatusDot } from '../GatewayStatusDot'
import { useHarnessStatus } from '@/hooks/useHarnessStatus'

describe('GatewayStatusDot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing (returns null) while isLoading is true', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: true,
      providerLabel: 'Harness',
    })

    const { container } = render(<GatewayStatusDot />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a dot with title "Harness connected" when status is connected', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Harness',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Harness connected')).toBeInTheDocument()
  })

  it('renders a dot with title "Harness offline" when status is disconnected', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'disconnected',
      connected: false,
      isLoading: false,
      providerLabel: 'Harness',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Harness offline')).toBeInTheDocument()
  })

  it('includes the diagnostic detail in the tooltip when auth fails', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'disconnected',
      connected: false,
      isLoading: false,
      providerLabel: 'Harness',
      detail: 'Harness rejected the configured auth token. Checked /sessions.',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Harness offline. Harness rejected the configured auth token. Checked /sessions.')).toBeInTheDocument()
  })

  it('renders a dot with title "Harness not configured" when status is not_configured', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'not_configured',
      connected: false,
      isLoading: false,
      providerLabel: 'Harness',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Harness not configured')).toBeInTheDocument()
  })

  it('renders the text label when showLabel=true', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Harness',
    })

    render(<GatewayStatusDot showLabel={true} />)
    expect(screen.getByText('Harness connected')).toBeInTheDocument()
  })

  it('does NOT render the text label when showLabel is omitted (defaults false)', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Harness',
    })

    render(<GatewayStatusDot />)
    // Title attr has the label text, but no visible text span
    expect(screen.getByTitle('Harness connected')).toBeInTheDocument()
    expect(screen.queryByText('Harness connected')).not.toBeInTheDocument()
  })

  it('has aria-live="polite" for accessibility', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Harness',
    })

    const { container } = render(<GatewayStatusDot />)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
  })

  it('renders a Hermes-specific label when the provider is Hermes Agent', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })

    render(<GatewayStatusDot showLabel />)
    expect(screen.getByText('Hermes Agent connected')).toBeInTheDocument()
  })
})
