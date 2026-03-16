import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the api module before importing the component
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({})),
  },
}))

import { ConnectionStatus } from '../ConnectionStatus'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders a clickable button', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('renders "Services" label when not collapsed', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      expect(screen.getByText('Services')).toBeInTheDocument()
    })

    it('does not render "Services" label when collapsed', () => {
      render(<ConnectionStatus collapsed={true} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
    })

    it('has aria-live="polite" on the container', () => {
      const { container } = render(
        <ConnectionStatus collapsed={false} textOpacity={1} />,
        { wrapper: createWrapper() },
      )
      const liveRegion = container.querySelector('[aria-live="polite"]')
      expect(liveRegion).toBeInTheDocument()
    })
  })

  describe('expand/collapse interaction', () => {
    it('does not show expanded details by default', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      // Service names only appear in the expanded panel
      expect(screen.queryByText('BlueBubbles')).not.toBeInTheDocument()
    })

    it('shows service names after clicking the button', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByText('BlueBubbles')).toBeInTheDocument()
      expect(screen.getByText('OpenClaw')).toBeInTheDocument()
      expect(screen.getByText('Supabase')).toBeInTheDocument()
    })

    it('hides details after clicking again', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      fireEvent.click(screen.getByRole('button'))
      expect(screen.getByText('BlueBubbles')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button'))
      expect(screen.queryByText('BlueBubbles')).not.toBeInTheDocument()
    })

    it('does not expand when collapsed', () => {
      render(<ConnectionStatus collapsed={true} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      fireEvent.click(screen.getByRole('button'))
      // expanded && !collapsed is false, so details should not appear
      expect(screen.queryByText('BlueBubbles')).not.toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows "Checking..." for each service while loading', () => {
      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })
      fireEvent.click(screen.getByRole('button'))
      const checkingElements = screen.getAllByText('Checking...')
      expect(checkingElements).toHaveLength(3)
    })
  })

  describe('resolved state', () => {
    it('shows status labels after services resolve', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({})

      render(<ConnectionStatus collapsed={false} textOpacity={1} />, {
        wrapper: createWrapper(),
      })

      fireEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.queryByText('Checking...')).not.toBeInTheDocument()
      })

      // All services resolved successfully, so they should show "Connected" with latency
      const connectedLabels = screen.getAllByText(/Connected/)
      expect(connectedLabels.length).toBe(3)
    })
  })
})
