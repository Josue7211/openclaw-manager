import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VncPreviewWidget } from '../VncPreviewWidget'

const mockGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: {
    get: mockGet,
  },
}))

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VncPreviewWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('VncPreviewWidget', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('shows ready when the embedded viewer endpoint is reachable', async () => {
    mockGet.mockResolvedValueOnce({
      configured: true,
      reachable: true,
      available: true,
      active: 0,
      max: 8,
      message: 'Embedded viewer is online',
    })

    renderWidget()

    await waitFor(() => expect(screen.getByText('Viewer Ready')).toBeInTheDocument())
    expect(mockGet).toHaveBeenCalledWith('/api/vnc/status')
  })

  it('shows active when a viewer session is connected', async () => {
    mockGet.mockResolvedValueOnce({
      configured: true,
      reachable: true,
      available: true,
      active: 1,
      max: 8,
      message: 'Embedded viewer is online',
    })

    renderWidget()

    await waitFor(() => expect(screen.getByText('Viewer Active')).toBeInTheDocument())
  })

  it('shows offline when the VNC handshake fails', async () => {
    mockGet.mockResolvedValueOnce({
      configured: true,
      reachable: false,
      available: false,
      active: 0,
      max: 8,
      reason: 'probe timed out',
      message: 'Embedded viewer is not reachable',
    })

    renderWidget()

    await waitFor(() => expect(screen.getByText('Viewer Offline')).toBeInTheDocument())
  })
})
