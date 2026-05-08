import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/wizard-store', () => ({
  setWizardStep: vi.fn(),
  activateDemoMode: vi.fn(),
  completeWizard: vi.fn(),
  updateWizardField: vi.fn(),
}))

vi.mock('@/lib/animation-intensity', () => ({
  shouldReduceMotion: vi.fn(() => true),
  shouldAnimate: vi.fn(() => false),
}))

vi.mock('@/lib/setup', () => ({
  getSetupStatus: vi.fn(),
  normalizeBackendUrl: vi.fn((value?: string) => (value || 'http://127.0.0.1:5000').trim().replace(/\/+$/, '')),
  pairWithBackend: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  getApiBase: vi.fn(() => 'http://127.0.0.1:5000'),
  getConfiguredBackendBase: vi.fn(() => 'http://127.0.0.1:5000'),
  setApiBase: vi.fn(),
  setConfiguredBackendBase: vi.fn(),
}))

import WizardWelcome from '../WizardWelcome'
import { completeWizard, updateWizardField } from '@/lib/wizard-store'
import { getSetupStatus } from '@/lib/setup'
import { setApiBase, setConfiguredBackendBase } from '@/lib/api'

describe('WizardWelcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSetupStatus).mockResolvedValue({
      ok: true,
      backend_public_base_url: 'http://backend.test:3000',
      pairing_required: false,
      capabilities: {
        google_oauth: true,
        github_oauth: true,
        harness: true,
        agentsecrets: true,
        memd: true,
      },
      services: {
        supabase: { configured: true, reachable: true },
        harness: { configured: true, reachable: true },
        agentsecrets: { configured: true, reachable: true },
        memd: { configured: true, reachable: true },
      },
      missing: [],
    })
  })

  it('uses the current backend when the backend is ready', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()

    render(<WizardWelcome onComplete={onComplete} />)

    await screen.findByText('Backend-first setup')
    const button = await screen.findByRole('button', { name: 'Use Current Backend' })
    await user.click(button)

    expect(setConfiguredBackendBase).toHaveBeenCalledWith('http://backend.test:3000')
    expect(setApiBase).toHaveBeenCalledWith('http://backend.test:3000')
    expect(updateWizardField).toHaveBeenCalledWith('backendUrl', 'http://backend.test:3000')
    expect(completeWizard).toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalled()
  })

  it('shows backend errors from the setup status check', async () => {
    vi.mocked(getSetupStatus).mockRejectedValueOnce(new Error('Backend request timed out'))

    render(<WizardWelcome />)

    await waitFor(() => {
      expect(screen.getByText('Backend request timed out')).toBeInTheDocument()
    })
  })
})
