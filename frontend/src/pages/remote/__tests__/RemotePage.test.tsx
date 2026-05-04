import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RemotePage from '../RemotePage'

const mockApiGet = vi.hoisted(() => vi.fn())
const mockApiPost = vi.hoisted(() => vi.fn())
const mockDisconnect = vi.hoisted(() => vi.fn())
const mockRfb = vi.hoisted(() => vi.fn())

vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ defaultTitle }: { defaultTitle: string }) => <h1>{defaultTitle}</h1>,
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
  },
  getLocalApiKey: () => 'local-key',
}))

vi.mock('@novnc/novnc', () => ({
  default: mockRfb,
}))

function renderRemotePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RemotePage />
    </QueryClientProvider>,
  )
}

describe('RemotePage', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    mockDisconnect.mockReset()
    mockRfb.mockReset()
    mockRfb.mockImplementation(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      disconnect: mockDisconnect,
      clipboardPasteFrom: vi.fn(),
    }))
  })

  it('starts noVNC when the backend reports the viewer is available', async () => {
    mockApiGet.mockResolvedValue({
      configured: true,
      reachable: true,
      available: true,
      active: 0,
      max: 8,
      message: 'Embedded viewer is online',
      reason: null,
    })

    renderRemotePage()

    await waitFor(() => expect(mockRfb).toHaveBeenCalledTimes(1))
    expect(mockRfb.mock.calls[0][1]).toBe('ws://127.0.0.1:5000/api/vnc/ws?apiKey=local-key')
  })

  it('does not start noVNC when the viewer is offline', async () => {
    mockApiGet.mockResolvedValue({
      configured: true,
      reachable: false,
      available: false,
      active: 0,
      max: 8,
      message: 'Embedded viewer is not reachable',
      reason: 'probe timed out',
    })

    renderRemotePage()

    expect((await screen.findAllByText('Embedded viewer is not reachable')).length).toBeGreaterThan(0)
    expect(mockRfb).not.toHaveBeenCalled()
  })

  it('runs repair and reconnects after the backend repair succeeds', async () => {
    mockApiGet.mockResolvedValue({
      configured: true,
      reachable: false,
      available: false,
      active: 0,
      max: 8,
      message: 'Embedded viewer is not reachable',
      reason: 'probe timed out',
    })
    mockApiPost.mockResolvedValue({
      ok: true,
      target: 'all',
      steps: [
        { target: 'vnc', ok: true },
        { target: 'tunnel', ok: true },
      ],
    })

    renderRemotePage()

    const repairButtons = await screen.findAllByLabelText('Repair viewer')
    await act(async () => {
      fireEvent.click(repairButtons[0])
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/vnc/repair', { target: 'all' })
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2))
  })
})
