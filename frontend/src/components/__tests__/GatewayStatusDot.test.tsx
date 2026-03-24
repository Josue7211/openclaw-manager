import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the useGatewayStatus hook to isolate component rendering from API calls
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
import { useGatewayStatus } from '@/hooks/sessions/useGatewayStatus'

describe('GatewayStatusDot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing (returns null) while isLoading is true', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: true,
      protocol: null,
      reconnectAttempt: 0,
    })

    const { container } = render(<GatewayStatusDot />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a dot with title "Gateway connected" when status is connected', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Gateway connected')).toBeInTheDocument()
  })

  it('renders a dot with title "Gateway disconnected" when status is disconnected', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'disconnected',
      connected: false,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Gateway disconnected')).toBeInTheDocument()
  })

  it('renders a dot with title "Gateway not configured" when status is not_configured', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'not_configured',
      connected: false,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    expect(screen.getByTitle('Gateway not configured')).toBeInTheDocument()
  })

  it('renders the text label when showLabel=true', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot showLabel={true} />)
    expect(screen.getByText('Gateway connected')).toBeInTheDocument()
  })

  it('does NOT render the text label when showLabel is omitted (defaults false)', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    render(<GatewayStatusDot />)
    // Title attr has the label text, but no visible text span
    expect(screen.getByTitle('Gateway connected')).toBeInTheDocument()
    expect(screen.queryByText('Gateway connected')).not.toBeInTheDocument()
  })

  it('has aria-live="polite" for accessibility', () => {
    vi.mocked(useGatewayStatus).mockReturnValue({
      status: 'connected',
      connected: true,
      isLoading: false,
      protocol: null,
      reconnectAttempt: 0,
    })

    const { container } = render(<GatewayStatusDot />)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
  })
})
