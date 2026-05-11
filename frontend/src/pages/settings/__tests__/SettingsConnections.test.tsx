import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  API_BASE_CHANGED_EVENT: 'backend-api-base-changed',
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT: 'configured-backend-base-changed',
  getApiBase: vi.fn(() => 'http://127.0.0.1:5000'),
  getConfiguredBackendBase: vi.fn(() => 'http://127.0.0.1:5000'),
  setApiBase: vi.fn(),
  setConfiguredBackendBase: vi.fn(),
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('@/lib/setup', () => ({
  getSetupStatus: vi.fn(),
  normalizeBackendUrl: vi.fn((value?: string) => (value || 'http://127.0.0.1:5000').trim().replace(/\/+$/, '')),
  pairWithBackend: vi.fn(),
}))

vi.mock('@/hooks/useUserSecrets', () => ({
  useSaveSecret: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/lib/wizard-store', () => ({
  resetWizard: vi.fn(),
}))

import SettingsConnections from '../SettingsConnections'
import { api, setApiBase, setConfiguredBackendBase } from '@/lib/api'
import { getSetupStatus, pairWithBackend } from '@/lib/setup'

describe('SettingsConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/status/active-config') {
        return {
          bluebubbles_url: '',
          harness_url: '',
          agentshell_url: '',
        }
      }
      if (path === '/api/user-preferences') {
        return { ok: true, data: {} }
      }
      return null
    })

    vi.mocked(getSetupStatus).mockResolvedValue({
      ok: true,
      backend_public_base_url: 'http://server.test:3000',
      pairing_required: true,
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
    vi.mocked(pairWithBackend).mockResolvedValue({
      ok: true,
      paired: true,
      device_name: 'clawctrl Desktop',
      next: [],
    })
  })

  it('saves the selected backend only after the backend check succeeds', async () => {
    const user = userEvent.setup()

    render(<SettingsConnections />)

    const backendInput = await screen.findByLabelText('Backend URL')
    await user.clear(backendInput)
    await user.type(backendInput, 'http://server.test:3000///')
    await user.click(screen.getByRole('button', { name: 'Save Server' }))

    await waitFor(() => {
      expect(getSetupStatus).toHaveBeenCalledWith('http://server.test:3000')
      expect(setConfiguredBackendBase).toHaveBeenCalledWith('http://server.test:3000')
      expect(setApiBase).not.toHaveBeenCalledWith('http://server.test:3000')
      expect(screen.getByText('Backend target saved')).toBeInTheDocument()
    })
  })

  it('pairs the device with the selected backend when pairing is required', async () => {
    const user = userEvent.setup()

    render(<SettingsConnections />)

    const tokenInput = await screen.findByLabelText('Pairing token')
    await user.type(tokenInput, 'pair-token-123')
    await user.click(screen.getByRole('button', { name: 'Pair Device' }))

    await waitFor(() => {
      expect(pairWithBackend).toHaveBeenCalledWith(
        'pair-token-123',
        'clawctrl Desktop',
        'http://127.0.0.1:5000',
      )
      expect(pairWithBackend).toHaveBeenCalledTimes(1)
      expect(setApiBase).toHaveBeenCalledWith('http://127.0.0.1:5000')
      expect(screen.getByText('Backend paired')).toBeInTheDocument()
    })
  })
})
