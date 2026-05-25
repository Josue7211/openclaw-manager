import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockApiGet, mockUseHermesUsage } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockUseHermesUsage: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
  },
}))

vi.mock('@/hooks/useHermesUsage', () => ({
  useHermesUsage: () => mockUseHermesUsage(),
}))

import SettingsPage from '../Settings'

function renderSettings(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Settings chat parity routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/status') {
        return { name: 'Hermes', emoji: '', model: 'gpt-5.5', status: 'online', host: 'local' }
      }
      if (path === '/api/auth/session') {
        return { authenticated: false }
      }
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes Agent configured' },
          ],
        }
      }
      if (path === '/api/chat/models') {
        return {
          models: [
            { id: 'gpt-5.5', name: 'GPT 5.5', provider: 'hermes', local: false },
          ],
          currentModel: 'gpt-5.5',
        }
      }
      if (path === '/api/hermes/control/status') {
        return { version: '1.0.0', gateway_running: true, gateway_state: 'running', active_sessions: 2 }
      }
      if (path === '/api/hermes/control/infra') {
        return {
          nodes: [
            { id: 'hermes-dashboard', label: 'Hermes dashboard', url: 'http://127.0.0.1:9119', configured: true },
            { id: 'hermes-usage-api', label: 'Hermes usage API', url: 'http://127.0.0.1:2455', configured: true },
          ],
        }
      }
      if (path === '/api/hermes/control/setup/discord/discover') {
        return { defaults: { requireMention: true, replyToMode: 'first', allowAllUsers: false } }
      }
      if (path === '/api/hermes/control/setup/bluebubbles/discover') {
        return { bluebubbles: { host: 'http://127.0.0.1:1234', passwordConfigured: true } }
      }
      if (path === '/api/hermes/control/setup/matrix/audit') {
        return { status: 'retired', activeKeys: [] }
      }
      return {}
    })
    mockUseHermesUsage.mockReturnValue({
      usage: {
        raw: {},
        used: 40,
        limit: 100,
        remaining: 60,
        percent: 40,
        totalCost: 1.25,
        accounts: [{ id: 'personal', label: 'personal', remaining: 60, percent: 40, windows: [] }],
        windows: [
          { id: 'fiveHour', label: '5h', percent: 40 },
          { id: 'weekly', label: 'Week', percent: 55 },
        ],
      },
      loading: false,
      fetching: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('mounts the usage shortcut route without crashing', () => {
    renderSettings('/settings?section=usage')

    expect(screen.getByText('Hermes Agent Usage')).toBeInTheDocument()
    expect(screen.getByText('60 left')).toBeInTheDocument()
  })

  it('mounts the providers shortcut route without OpenClaw', async () => {
    renderSettings('/settings?section=providers')

    expect(await screen.findByLabelText('Hermes Agent status')).toBeInTheDocument()
    expect(screen.queryByLabelText('Legacy local agent provider status')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenClaw')).not.toBeInTheDocument()
  })

  it('mounts the Hermes Agent shortcut route with the control plane', async () => {
    renderSettings('/settings?section=hermes-agent')

    expect(await screen.findByText('Hermes Agent Control Plane')).toBeInTheDocument()
    expect(screen.getAllByText('Gateway').length).toBeGreaterThan(0)
    expect(screen.getByText('Active sessions')).toBeInTheDocument()
    expect(await screen.findByText('Hermes usage API')).toBeInTheDocument()
    expect(screen.queryByText('Codex LB')).not.toBeInTheDocument()
  })

  it('keeps the legacy Codex LB settings route as a Hermes Agent alias', async () => {
    renderSettings('/settings?section=codex-lb')

    expect(await screen.findByText('Hermes Agent Control Plane')).toBeInTheDocument()
    expect(screen.getAllByText('Gateway').length).toBeGreaterThan(0)
    expect(screen.getByText('Active sessions')).toBeInTheDocument()
    expect(await screen.findByText('Hermes usage API')).toBeInTheDocument()
    expect(screen.queryByText('Codex LB')).not.toBeInTheDocument()
  })
})
