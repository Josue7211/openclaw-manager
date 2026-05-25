import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the harness status hook to isolate component rendering from API calls
vi.mock('@/hooks/useHarnessStatus', () => ({
  useHarnessStatus: vi.fn(() => ({
    status: 'connected' as const,
    connected: true,
    isLoading: false,
    providerLabel: 'Hermes Agent',
  })),
}))

vi.mock('@/hooks/sessions/useGatewayStatus', () => ({
  useGatewayStatus: vi.fn(() => ({
    status: 'connected' as const,
    connected: true,
    isLoading: false,
    protocol: null,
    reconnectAttempt: 0,
  })),
}))

import { GatewayStatusDot } from '../GatewayStatusDot'
import { useHarnessStatus } from '@/hooks/useHarnessStatus'
import { useGatewayStatus } from '@/hooks/sessions/useGatewayStatus'

describe('GatewayStatusDot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })
  })

  it('renders nothing (returns null) while isLoading is true', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: true,
      providerLabel: 'Hermes Agent',
    })

    const { container } = render(<GatewayStatusDot />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a dot with title "Hermes Agent gateway connected" when gateway status is connected', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: 3,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Hermes Agent gateway connected. Protocol 3.')).toBeInTheDocument()
  })

  it('renders a dot with title "Hermes Agent gateway offline" when gateway status is disconnected', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'disconnected',
      connected: false,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Hermes Agent gateway offline')).toBeInTheDocument()
  })

  it('includes the diagnostic detail in the tooltip when HTTP auth fails', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'disconnected',
      connected: false,
      isLoading: false,
      providerLabel: 'Hermes Agent',
      detail: 'Hermes Agent rejected the configured auth token. Checked /sessions.',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Hermes Agent offline. Hermes Agent rejected the configured auth token. Checked /sessions.')).toBeInTheDocument()
  })

  it('shows gateway reconnect attempts when Hermes Agent HTTP is healthy', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'reconnecting',
      connected: false,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 2,
    })

    render(<GatewayStatusDot showLabel />)
    expect(screen.getByText('Hermes Agent gateway reconnecting')).toBeInTheDocument()
    expect(screen.getByTitle('Hermes Agent gateway reconnecting. Reconnect attempt 2.')).toBeInTheDocument()
  })

  it('renders a dot with title "Hermes Agent not configured" when status is not_configured', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'not_configured',
      connected: false,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Hermes Agent not configured')).toBeInTheDocument()
  })

  it('renders the text label when showLabel=true', () => {
    render(<GatewayStatusDot showLabel={true} />)
    expect(screen.getByText('Hermes Agent gateway connected')).toBeInTheDocument()
  })

  it('does NOT render the text label when showLabel is omitted (defaults false)', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })

    render(<GatewayStatusDot />)
    // Title attr has the label text, but no visible text span
    expect(screen.getByTitle('Hermes Agent gateway connected')).toBeInTheDocument()
    expect(screen.queryByText('Hermes Agent gateway connected')).not.toBeInTheDocument()
  })

  it('has aria-live="polite" for accessibility', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })

    const { container } = render(<GatewayStatusDot />)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
  })

  it('keeps the visible label generic', () => {
    vi.mocked(useHarnessStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      providerLabel: 'Hermes Agent',
    })

    render(<GatewayStatusDot showLabel />)
    expect(screen.getByText('Hermes Agent gateway connected')).toBeInTheDocument()
  })
})
