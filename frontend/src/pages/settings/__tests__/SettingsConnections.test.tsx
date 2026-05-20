import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  API_BASE_CHANGED_EVENT: 'backend-api-base-changed',
  CONFIGURED_BACKEND_BASE_CHANGED_EVENT: 'configured-backend-base-changed',
  getApiBase: vi.fn(() => 'http://127.0.0.1:5000'),
  getConfiguredBackendBase: vi.fn(() => 'http://127.0.0.1:5000'),
  setApiBase: vi.fn(),
  setApiKey: vi.fn(),
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
    window.history.pushState({}, '', '/settings')

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
      if (path === '/api/homelab/config') {
        return {
          ok: true,
          data: {
            api_configured: { proxmox: false, opnsense: false, portainer: false },
            local: {
              proxmox_host: '',
              proxmox_token_id: '',
              proxmox_token_secret_set: false,
              opnsense_host: '',
              opnsense_key_set: false,
              opnsense_secret_set: false,
              portainer_instances: [],
            },
          },
        }
      }
      return null
    })
    vi.mocked(api.put).mockResolvedValue({
      ok: true,
      data: {
        api_configured: { proxmox: true, opnsense: true, portainer: true },
        local: {
          proxmox_host: 'https://pve.test:8006',
          proxmox_token_id: 'root@pam!claw',
          proxmox_token_secret_set: true,
          opnsense_host: 'https://opn.test',
          opnsense_key_set: true,
          opnsense_secret_set: true,
          portainer_instances: [{
            id: 'portainer-test',
            name: 'Services Portainer',
            url: 'https://portainer.test:9443',
            token_set: true,
          }],
        },
      },
    })
    vi.mocked(api.post).mockResolvedValue({
      ok: true,
      data: { synced: ['proxmox', 'opnsense', 'portainer'], skipped: [] },
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

  it('saves multi-Portainer Home Lab config through the backend', async () => {
    const user = userEvent.setup()

    render(<SettingsConnections />)

    await user.click(await screen.findByRole('button', { name: 'Add Portainer' }))
    await user.clear(screen.getByLabelText('Portainer 1 name'))
    await user.type(screen.getByLabelText('Portainer 1 name'), 'Services Portainer')
    await user.type(screen.getByLabelText('Portainer 1 URL'), 'https://portainer.test:9443')
    await user.type(screen.getByLabelText('Portainer 1 API token'), 'ptr_secret')
    await user.click(screen.getByRole('button', { name: 'Save Home Lab' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/homelab/config', expect.objectContaining({
        portainer_instances: [expect.objectContaining({
          name: 'Services Portainer',
          url: 'https://portainer.test:9443',
          token: 'ptr_secret',
        })],
      }))
      expect(api.post).toHaveBeenCalledWith('/api/homelab/sync')
      expect(screen.getByText('Saved locally and synced.')).toBeInTheDocument()
    })
  })

  it('opens a focused Media Command credential target from query params', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/settings?section=connections&service=kometa&keys=kometa.url%2Ckometa.api-key')

    render(<SettingsConnections />)

    expect(await screen.findByText('Kometa setup')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Kometa URL'), 'http://kometa.test')
    await user.type(screen.getByLabelText('Kometa API Key'), 'kometa_secret')
    await user.click(screen.getByRole('button', { name: 'Save Kometa' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/secrets/kometa', {
        credentials: {
          url: 'http://kometa.test',
          api_key: 'kometa_secret',
        },
      })
      expect(screen.getByText('Saved. Restart to apply changes.')).toBeInTheDocument()
    })
  })
})
