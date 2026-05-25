import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { WizardConnectionTest } from '../WizardConnectionTest'

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

describe('WizardConnectionTest', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('uses Hermes Agent copy for the legacy harness service id', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 'ok', latency_ms: 42 })

    render(
      <ToastProvider>
        <WizardConnectionTest
          service="harness"
          url="http://100.64.0.1:18789"
          credentials={{ key: 'secret' }}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Test connection to Hermes Agent' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/wizard/test-connection', {
        service: 'harness',
        url: 'http://100.64.0.1:18789',
        key: 'secret',
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Connected to Hermes Agent (42ms)')
    expect(screen.queryByText(/harness/i)).not.toBeInTheDocument()
  })

  it('uses Hermes Agent copy for connection failures too', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ status: 'error', error: 'offline' })

    render(
      <ToastProvider>
        <WizardConnectionTest
          service="harness"
          url="http://100.64.0.1:18789"
          credentials={{ key: 'secret' }}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Test connection to Hermes Agent' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hermes Agent: offline')
  })
})
